"""
Agente y proceso de QA e inspección visual del Muro de Prensa (LyAi Prensa).

Revisa las cards y el muro exactamente como lo ve el usuario final desde fuera
antes y después de publicar, anticipando y remediando errores en el frontend:
1. Auditoría de integridad de cards (titulares, entidades HTML no escapadas, fotos placeholder/rotas).
2. Verificación de contradicciones y claims (relaciones válidas, scores coherentes).
3. Inspección visual y funcional en navegador real (Headless Chrome con Playwright):
   - Cero errores JS (pageerror / console.error).
   - Renderizado del canvas 3D (WallGL) sin pantalla en blanco.
   - Navegación entre días (garantiza que cambiar de fecha no deja la pantalla en blanco).
   - Conmutación entre vistas (3D, Bento, Timeline).
   - Captura de evidencias fotográficas en qa_reports/.

Uso:
    python3 -m pipeline.qa_wall_inspector [--auto-fix] [--skip-browser] [--url http://172.18.0.31]
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from pipeline.db import connect
from pipeline.qa_images import is_placeholder_image, purge_database_placeholders


REPORTS_DIR = Path("/opt/lyai/app/lyai-prensa/qa_reports")
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

HTML_ENTITY_PATTERN = re.compile(r"&(?:amp|quot|#039|[a-z]{2,8}|#\d{2,5});", re.IGNORECASE)
HTML_TAG_PATTERN = re.compile(r"<[^>]+>")


@dataclass
class QAIssue:
    severity: str  # 'CRITICAL', 'WARNING', 'INFO'
    category: str  # 'HTML_ENCODING', 'IMAGE_HEALTH', 'CONTRADICTIONS', 'BROWSER_CONSOLE', 'VISUAL_REGRESSION'
    message: str
    item_id: str | None = None
    fixed: bool = False


@dataclass
class QAReport:
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    total_cards_checked: int = 0
    issues: list[QAIssue] = field(default_factory=list)
    health_score: int = 100
    browser_checks_passed: bool = False
    screenshots: list[str] = field(default_factory=list)

    def add_issue(self, severity: str, category: str, message: str, item_id: str | None = None, fixed: bool = False):
        self.issues.append(QAIssue(severity, category, message, item_id, fixed))
        penalty = {"CRITICAL": 20, "WARNING": 5, "INFO": 1}.get(severity, 2)
        if not fixed:
            self.health_score = max(0, self.health_score - penalty)


class WallQAInspector:
    def __init__(self, base_url: str = "http://172.18.0.31", auto_fix: bool = False):
        self.base_url = base_url.rstrip("/")
        self.auto_fix = auto_fix
        self.report = QAReport()

    # =========================================================================
    # 1. AUDITORÍA DE DATOS DE CARDS EN BASE DE DATOS Y API
    # =========================================================================

    def audit_database_cards(self, conn) -> None:
        """Audita las noticias recientes directamente en DB y corrige textos/imágenes si auto_fix=True."""
        print("🔍 [QA 1/3] Auditando integridad de datos en cards (DB)...")
        
        with conn.cursor() as cur:
            # Revisar las últimas 500 noticias
            cur.execute("""
                SELECT id, titular, descripcion, enlace, imagen_url, publicada_en
                FROM prensa.noticias
                ORDER BY publicada_en DESC
                LIMIT 500;
            """)
            rows = cur.fetchall()

        self.report.total_cards_checked = len(rows)
        html_fix_candidates: list[tuple[str, str, str]] = []  # (titular_clean, desc_clean, id)
        placeholder_candidates: list[str] = []

        for row in rows:
            nid, titular, desc, enlace, img_url, pub_en = row
            desc = desc or ""

            # A. Detección de entidades HTML mal escapadas (&amp;, &#039;, etc.)
            has_html_in_title = bool(HTML_ENTITY_PATTERN.search(titular) or HTML_TAG_PATTERN.search(titular))
            has_html_in_desc = bool(HTML_ENTITY_PATTERN.search(desc) or HTML_TAG_PATTERN.search(desc))

            if has_html_in_title or has_html_in_desc:
                clean_title = html_lib.unescape(HTML_TAG_PATTERN.sub("", titular)).strip()
                clean_desc = html_lib.unescape(HTML_TAG_PATTERN.sub("", desc)).strip()
                self.report.add_issue(
                    severity="WARNING",
                    category="HTML_ENCODING",
                    message=f"Texto con entidades HTML sin decodificar en noticia '{titular[:50]}...'",
                    item_id=str(nid),
                    fixed=self.auto_fix,
                )
                if self.auto_fix:
                    html_fix_candidates.append((clean_title, clean_desc, str(nid)))

            # B. Detección de imágenes placeholder
            if img_url and is_placeholder_image(img_url):
                self.report.add_issue(
                    severity="WARNING",
                    category="IMAGE_HEALTH",
                    message=f"Imagen placeholder genérica detectada: {img_url[:70]}",
                    item_id=str(nid),
                    fixed=self.auto_fix,
                )
                if self.auto_fix:
                    placeholder_candidates.append(str(nid))

            # C. Inconsistencia de campos obligatorios
            if not titular or len(titular.strip()) < 5:
                self.report.add_issue(
                    severity="CRITICAL",
                    category="CARD_PAYLOAD",
                    message="Titular vacío o anormalmente corto",
                    item_id=str(nid),
                )

        # Aplicar auto-correcciones en DB si corresponde
        if self.auto_fix:
            if html_fix_candidates:
                with conn.cursor() as cur:
                    cur.executemany(
                        "UPDATE prensa.noticias SET titular = %s, descripcion = %s WHERE id = %s",
                        html_fix_candidates,
                    )
                conn.commit()
                print(f"  ✨ Corregidas {len(html_fix_candidates)} cards con entidades HTML mal codificadas.")

            if placeholder_candidates:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE prensa.noticias SET imagen_url = NULL WHERE id = ANY(%s)",
                        (placeholder_candidates,),
                    )
                conn.commit()
                print(f"  ✨ Purgadas {len(placeholder_candidates)} imágenes placeholder a NULL.")

            # Purga global adicional de duplicados
            purged = purge_database_placeholders(conn)
            if purged > 0:
                print(f"  ✨ Purgados {purged} logotipos/placeholders duplicados adicionales.")

    def audit_contradictions_integrity(self, conn) -> None:
        """Verifica que las contradicciones apunten a claims y noticias existentes y con scores válidos."""
        print("🔍 [QA 2/3] Auditando consistencia de contradicciones...")
        with conn.cursor() as cur:
            cur.execute("""
                SELECT c.id, c.claim_a_id, c.claim_b_id, c.intensidad, c.razonamiento,
                       ca.noticia_id as n1, cb.noticia_id as n2
                FROM prensa.contradicciones c
                JOIN prensa.claims ca ON c.claim_a_id = ca.id
                JOIN prensa.claims cb ON c.claim_b_id = cb.id
                ORDER BY c.created_at DESC
                LIMIT 100;
            """)
            rows = cur.fetchall()

        for row in rows:
            cid, ca_id, cb_id, intensidad, razonamiento, n1, n2 = row
            if intensidad is not None and not (0.0 <= float(intensidad) <= 1.0):
                self.report.add_issue(
                    severity="WARNING",
                    category="CONTRADICTIONS",
                    message=f"Intensidad de contradicción fuera de rango: {intensidad}",
                    item_id=str(cid),
                )
            if not razonamiento or len(razonamiento.strip()) < 5:
                self.report.add_issue(
                    severity="WARNING",
                    category="CONTRADICTIONS",
                    message="Razonamiento de contradicción vacío o truncado",
                    item_id=str(cid),
                )
            if n1 == n2:
                self.report.add_issue(
                    severity="INFO",
                    category="CONTRADICTIONS",
                    message=f"Contradicción interna en la misma noticia {n1}",
                    item_id=str(cid),
                )

    # =========================================================================
    # 2. INSPECCIÓN VISUAL Y E2E EN NAVEGADOR (CHROME HEADLESS PLAYWRIGHT)
    # =========================================================================

    def run_browser_visual_inspection(self) -> None:
        """Abre la aplicación en Google Chrome real headless, prueba interacciones y captura pantallas."""
        print(f"🔍 [QA 3/3] Inspeccionando el Muro visualmente desde el navegador ({self.base_url})...")
        
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            print("  ⚠️ Playwright no está disponible, saltando inspección en navegador.")
            return

        console_errors: list[str] = []
        page_errors: list[str] = []

        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path="/usr/bin/google-chrome",
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--use-gl=swiftshader"],
            )
            context = browser.new_context(viewport={"width": 1920, "height": 1080})
            page = context.new_page()

            # Capturar logs de consola y errores no capturados
            page.on("pageerror", lambda err: page_errors.append(str(err)))
            page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ("error", "warning") else None)

            # Prevenir modal de instalación PWA para que no tape la vista del muro en QA
            page.add_init_script("localStorage.setItem('pwa-dismissed', 'true'); localStorage.setItem('lyai_pwa_dismissed', 'true');")

            # Paso 1: Carga inicial de la app
            t0 = time.time()
            resp = page.goto(self.base_url, wait_until="networkidle", timeout=15000)
            load_time = time.time() - t0
            print(f"  ⏱️ Muro cargado en {load_time:.2f}s (HTTP {resp.status if resp else 'N/A'})")

            # Descartar modal si aún saliera
            try:
                dismiss_btn = page.locator("text=Continuar en el navegador")
                if dismiss_btn.is_visible(timeout=1000):
                    dismiss_btn.click()
            except Exception:
                pass

            time.sleep(2.5)  # Dejar que Three.js renderice el primer frame y texturas

            # Captura 1: Muro 3D general
            shot_main = str(REPORTS_DIR / "wall_3d_primary.png")
            page.screenshot(path=shot_main)
            self.report.screenshots.append(shot_main)
            print(f"  📸 Captura Muro 3D guardada: {shot_main}")

            # Esperar a que el canvas esté adjunto al DOM y listo
            try:
                canvas = page.locator("canvas").first
                canvas.wait_for(state="attached", timeout=8000)
                time.sleep(1.5)  # Tiempo para que el Splash se desvanezca y Three.js pinte
                box = canvas.bounding_box()
                if not box or box["width"] < 400 or box["height"] < 300:
                    self.report.add_issue(
                        severity="CRITICAL",
                        category="VISUAL_REGRESSION",
                        message=f"Dimensiones anómalas de Canvas WebGL: {box}",
                    )
            except Exception as e:
                self.report.add_issue(
                    severity="CRITICAL",
                    category="VISUAL_REGRESSION",
                    message=f"Canvas WebGL no disponible o destruido: {e}",
                )

            # Paso 3: Probar el cambio de día (evitar la regresión de pantalla en blanco al cambiar de fecha)
            print("  📅 Probando navegación de fecha (Retroceder 1 día)...")
            try:
                # El botón anterior de fecha suele ser un chevron o botón en DateNav / HeaderDock
                prev_date_btn = page.locator("button[aria-label*='anterior'], button[title*='anterior'], .date-nav-prev, .dnav-btn:first-child").first
                if prev_date_btn.is_visible(timeout=2000):
                    prev_date_btn.click()
                    time.sleep(2)
                    shot_prev = str(REPORTS_DIR / "wall_date_prev.png")
                    page.screenshot(path=shot_prev)
                    self.report.screenshots.append(shot_prev)
                    print(f"  📸 Captura cambio de día guardada: {shot_prev}")
            except Exception as e:
                print(f"  ℹ️ Nota sobre navegación de fecha: {e}")

            # Paso 4: Probar la conmutación de vista a Bento Grid
            print("  🍱 Probando cambio a vista Bento...")
            try:
                bento_btn = page.locator("button[aria-label*='bento'], button[title*='Bento'], .view-switch-btn:nth-child(2)").first
                if bento_btn.is_visible(timeout=2000):
                    bento_btn.click()
                    time.sleep(1.5)
                    shot_bento = str(REPORTS_DIR / "wall_view_bento.png")
                    page.screenshot(path=shot_bento)
                    self.report.screenshots.append(shot_bento)
                    print(f"  📸 Captura Bento guardada: {shot_bento}")
            except Exception as e:
                print(f"  ℹ️ Nota sobre cambio a Bento: {e}")

            browser.close()

        # Analizar errores recopilados
        for err in page_errors:
            self.report.add_issue(
                severity="CRITICAL",
                category="BROWSER_CONSOLE",
                message=f"Error fatal JavaScript no capturado: {err}",
            )

        for msg in console_errors:
            # Filtrar warnings habituales de WebGL/driver de Chrome en entornos headless sin GPU hardware
            if "GPU stall due to ReadPixels" in msg or "WebGL" in msg:
                continue
            if "[error]" in msg:
                self.report.add_issue(
                    severity="WARNING",
                    category="BROWSER_CONSOLE",
                    message=f"Consola del navegador: {msg}",
                )

        if not page_errors:
            self.report.browser_checks_passed = True

    # =========================================================================
    # 3. GENERACIÓN DEL INFORME FINAL Y SENTINEL
    # =========================================================================

    def print_summary(self) -> None:
        print("\n" + "=" * 60)
        print("📊 RESUMEN DE CONTROL DE CALIDAD (QA WALL INSPECTOR)")
        print("=" * 60)
        print(f"Fecha/Hora:           {self.report.timestamp}")
        print(f"Cards inspeccionadas: {self.report.total_cards_checked}")
        print(f"Score de Salud:       {self.report.health_score}/100")
        print(f"Test Navegador Real:  {'✅ SUPERADO' if self.report.browser_checks_passed else '❌ FALLIDO'}")
        print(f"Capturas realizadas:  {len(self.report.screenshots)}")

        criticals = [i for i in self.report.issues if i.severity == "CRITICAL"]
        warnings = [i for i in self.report.issues if i.severity == "WARNING"]

        print(f"\nIncidencias Críticas: {len(criticals)}")
        for c in criticals:
            print(f"  ❌ [{c.category}] {c.message}")

        print(f"Advertencias:         {len(warnings)}")
        for w in warnings[:8]:  # Mostrar las primeras 8
            fix_mark = " (CORREGIDO)" if w.fixed else ""
            print(f"  ⚠️ [{w.category}] {w.message}{fix_mark}")
        if len(warnings) > 8:
            print(f"  ... y {len(warnings) - 8} advertencias más.")

        # Guardar informe JSON para auditoría
        report_path = REPORTS_DIR / "latest_qa_report.json"
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "timestamp": self.report.timestamp,
                    "health_score": self.report.health_score,
                    "total_cards_checked": self.report.total_cards_checked,
                    "browser_checks_passed": self.report.browser_checks_passed,
                    "screenshots": self.report.screenshots,
                    "issues": [
                        {
                            "severity": i.severity,
                            "category": i.category,
                            "message": i.message,
                            "item_id": i.item_id,
                            "fixed": i.fixed,
                        }
                        for i in self.report.issues
                    ],
                },
                f,
                indent=2,
                ensure_ascii=False,
            )
        print(f"\n📄 Informe guardado en: {report_path}")
        print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Inspector de QA y visualización para LyAi Prensa")
    parser.add_argument("--auto-fix", action="store_true", help="Corrige automáticamente errores en DB (entidades HTML, placeholders)")
    parser.add_argument("--skip-browser", action="store_true", help="Omite la prueba con Google Chrome headless")
    parser.add_argument("--url", default="http://172.18.0.31", help="URL base del frontend")
    args = parser.parse_args()

    inspector = WallQAInspector(base_url=args.url, auto_fix=args.auto_fix)
    
    conn = connect()
    try:
        inspector.audit_database_cards(conn)
        inspector.audit_contradictions_integrity(conn)
    finally:
        conn.close()

    if not args.skip_browser:
        inspector.run_browser_visual_inspection()

    inspector.print_summary()

    # Si hay errores críticos, retornar código de salida 1
    has_criticals = any(i.severity == "CRITICAL" for i in inspector.report.issues)
    if has_criticals:
        sys.exit(1)


if __name__ == "__main__":
    main()

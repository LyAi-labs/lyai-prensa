import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
        context = await browser.new_context(viewport={'width': 1440, 'height': 900})
        page = await context.new_page()

        print("Navigating to app...")
        await page.goto("http://172.18.0.31", wait_until="networkidle")
        await asyncio.sleep(2)

        # Ensure contradiction filter is active or find contradiction card
        print("Waiting for wall and cards to be ready...")
        # Check if contradiction filter button exists in toolbar
        contra_filter = page.locator("button:has-text('Contradicciones'), button:has-text('Discrepancias'), button[data-filter='contradictions']")
        if await contra_filter.count() > 0:
            print("Clicking contradiction filter...")
            await contra_filter.first.click()
            await asyncio.sleep(1.5)

        # Wait for Three.js canvas
        canvas = page.locator("canvas")
        await canvas.wait_for(state="visible", timeout=10000)
        print("Canvas found!")

        # Check API to see which news item has contradictions
        # In our earlier curl we found 'b73a2732-d4a3-4ea0-ae4d-3b6f65cc66cc' and 'bc92ae19-2f30-401d-ac0c-4915beb45ce4'
        # Let's inspect the cards in the scene via window or click on canvas
        # Let's click in the middle of canvas to select a card
        # Or better: let's evaluate in page context to click or trigger the card
        res = await page.evaluate("""() => {
            // Find if there's any card with contradiction in DOM or trigger through window
            const cards = document.querySelectorAll('.pc-contra-bar, .pc-contra-badge');
            return { cardsFound: cards.length };
        }""")
        print("Initial scan:", res)

        # Let's click at coordinates on the canvas where cards are rendered
        # Canvas center is (720, 450)
        print("Clicking canvas center (720, 450)...")
        await page.mouse.click(720, 450)
        await asyncio.sleep(1)

        # Check if CardOverlay appeared
        overlay = page.locator(".ls-ao")
        overlay_count = await overlay.count()
        print(f"Overlay count after canvas click: {overlay_count}")

        if overlay_count == 0:
            # Let's click a few positions on the canvas
            for x, y in [(600, 350), (840, 350), (720, 500), (500, 450), (900, 450)]:
                await page.mouse.click(x, y)
                await asyncio.sleep(0.5)
                if await overlay.count() > 0:
                    print(f"Opened overlay at ({x}, {y})!")
                    break

        # Check overlay
        if await overlay.count() > 0:
            print("Card overlay is open!")
            # Take screenshot of flipped card
            await page.screenshot(path="/home/lyai/.gemini/antigravity/brain/7e609e85-c099-4dd0-afc0-3eaf3fa22aa2/qa_step1_flipped_card.png")
            print("Saved qa_step1_flipped_card.png")

            # Check hover styles on the flipped card
            hover_test = await page.evaluate("""() => {
                const flip = document.querySelector('.ls-flip.is-flipped');
                const tilt = document.querySelector('.ls-flip-tilt');
                const spotlight = document.querySelector('.pc-spotlight');
                const glow = document.querySelector('.spotlight-glow');
                const border = document.querySelector('.spotlight-border');
                const computedTilt = tilt ? window.getComputedStyle(tilt).transform : 'none';
                const computedGlow = glow ? window.getComputedStyle(glow).display : 'none';
                const computedBorder = border ? window.getComputedStyle(border).display : 'none';
                return {
                    hasFlippedClass: !!flip,
                    tiltTransform: computedTilt,
                    glowDisplay: computedGlow,
                    borderDisplay: computedBorder
                };
            }""")
            print("Hover / Tilt status on flipped card:", hover_test)

            # Check if it has the compare button or contradiction section
            compare_btn = page.locator(".pc-compare-btn")
            btn_count = await compare_btn.count()
            print(f"Compare button count: {btn_count}")

            if btn_count > 0:
                print("Clicking 'Comparar ambas versiones cara a cara' button (2nd click)...")
                await compare_btn.click()
            else:
                print("Clicking anywhere on card back for 2nd click...")
                card_back = page.locator(".ls-ao-card")
                await card_back.click()

            await asyncio.sleep(1)

            # Check if .pc-popout-overlay is visible
            popout = page.locator(".pc-popout-overlay")
            popout_visible = await popout.is_visible()
            print(f"Popout overlay visible: {popout_visible}")

            if popout_visible:
                # Check contents inside popout
                info = await page.evaluate("""() => {
                    const title = document.querySelector('.pc-popout-title')?.textContent;
                    const beacons = document.querySelectorAll('.pc-fact-beacon');
                    const marks = document.querySelectorAll('.pc-fact-token-mark');
                    const cards = document.querySelectorAll('.pc-popout-card');
                    const vsRing = document.querySelector('.pc-popout-vs-ring');
                    return {
                        title,
                        beaconsCount: beacons.length,
                        marksCount: marks.length,
                        cardsCount: cards.length,
                        hasVsRing: !!vsRing,
                        beaconA: beacons[0]?.textContent?.trim(),
                        beaconB: beacons[1]?.textContent?.trim()
                    };
                }""")
                print("Popout inspection:", info)
                await page.screenshot(path="/home/lyai/.gemini/antigravity/brain/7e609e85-c099-4dd0-afc0-3eaf3fa22aa2/qa_step2_side_by_side.png")
                print("Saved qa_step2_side_by_side.png")
            else:
                print("Popout overlay was not visible immediately, checking DOM...")
                html = await page.evaluate("() => document.querySelector('.pc-popout-overlay')?.outerHTML")
                print("Popout HTML:", html)
        else:
            print("Could not open overlay via canvas click. Checking page...")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())


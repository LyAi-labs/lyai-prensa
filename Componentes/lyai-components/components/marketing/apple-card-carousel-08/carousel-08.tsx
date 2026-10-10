"use client";

import * as React from "react";
import { ArrowUpRight, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { ReactNode } from "react";

interface CardItem {
  id: string;
  category: string;
  title: ReactNode;
  src: string;
  alt?: string;
}

const cards: CardItem[] = [
  {
    id: "1",
    category: "Design Excellence",
    title: <>Elegant experiences, thoughtfully created.</>,
    src: "https://cdn.21st.dev/assets/localized/0ac23730453fa82560c6dc05f844229755b3a58250902ada80291abc44fabed4.webp",
  },
  {
    id: "2",
    category: "Quality",
    title: <>Attention to detail, from start to finish.</>,
    src: "https://cdn.21st.dev/assets/localized/fc2ea5740d2d320ddaf5f8a31715ba6e8b9ac6952d623a2236d382bdc54d9510.webp",
  },
  {
    id: "3",
    category: "Technology",
    title: <>Powerful solutions, beautifully engineered.</>,
    src: "https://cdn.21st.dev/assets/localized/1d7b11d323cee946156033115e6a6b8e19653128a20c950add3bd0be32256df4.webp",
  },
  {
    id: "4",
    category: "Growth",
    title: (
      <>
        Built to scale,
        <br /> ready to lead.
      </>
    ),
    src: "https://cdn.21st.dev/assets/localized/d537dca16bfaedaa5a6c72f762c0a7a2b6430cf43e972cb80e84cab0688aa27d.webp",
  },
  {
    id: "5",
    category: "Design Excellence",
    title: <>Elegant experiences, thoughtfully created.</>,
    src: "https://cdn.21st.dev/assets/localized/0ac23730453fa82560c6dc05f844229755b3a58250902ada80291abc44fabed4.webp",
  },
  {
    id: "6",
    category: "Quality",
    title: <>Attention to detail, from start to finish.</>,
    src: "https://cdn.21st.dev/assets/localized/fc2ea5740d2d320ddaf5f8a31715ba6e8b9ac6952d623a2236d382bdc54d9510.webp",
  },
  {
    id: "7",
    category: "Technology",
    title: <>Powerful solutions, beautifully engineered.</>,
    src: "https://cdn.21st.dev/assets/localized/1d7b11d323cee946156033115e6a6b8e19653128a20c950add3bd0be32256df4.webp",
  },
  {
    id: "8",
    category: "Growth",
    title: (
      <>
        Built to scale,
        <br /> ready to lead.
      </>
    ),
    src: "https://cdn.21st.dev/assets/localized/d537dca16bfaedaa5a6c72f762c0a7a2b6430cf43e972cb80e84cab0688aa27d.webp",
  },
];

const AppleCardCarousel = () => {
  const [api, setApi] = React.useState<CarouselApi>();
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(true);

  React.useEffect(() => {
    if (!api) return;
    const update = () => {
      setCanScrollPrev(api.canScrollPrev());
      setCanScrollNext(api.canScrollNext());
    };
    update();
    api.on("select", update);
    api.on("reInit", update);
    return () => {
      api.off("select", update);
      api.off("reInit", update);
    };
  }, [api]);

  return (
    <div className="w-full py-5 sm:py-10">
      {/* Header */}
      <div className="px-4 sm:px-8 mb-8 sm:mb-12">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-foreground">
          Get to know shadcnspace
        </h2>
      </div>

      {/* Card Strip */}
      <Carousel
        setApi={setApi}
        opts={{ align: "start", dragFree: true }}
        className="w-full"
      >
        <CarouselContent className="-ml-6 px-4 sm:px-8 py-4">
          {cards.map((card) => (
            <CarouselItem key={card.id} className="pl-6 basis-auto">
              <div className="group relative w-70 h-115 sm:w-80 sm:h-130 lg:w-92.5 lg:h-150 border border-border overflow-hidden flex flex-col justify-between p-6 sm:p-8 rounded-2xl hover:scale-102 transition-transform duration-300 cursor-pointer">
                <img
                  src={card.src}
                  alt={
                    card.alt ||
                    (typeof card.title === "string"
                      ? card.title
                      : card.category)
                  }
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="relative z-10 flex flex-col gap-3 sm:gap-4 text-white">
                  <p className="text-sm sm:text-base font-medium">
                    {card.category}
                  </p>
                  <p className="text-2xl sm:text-3xl font-medium tracking-tight leading-tight">
                    {card.title}
                  </p>
                </div>

                <div className="relative z-10 flex justify-end">
                  <Button
                    size="icon"
                    className="h-10 w-10 rounded-full shadow-xs bg-white hover:bg-white/80 cursor-pointer flex items-center justify-center"
                  >
                    <ArrowUpRight className="h-4 w-4 text-black transition-transform duration-300 group-hover:rotate-45 will-change-transform" />
                  </Button>
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      {/* Bottom-right controls */}
      <div className="flex justify-end gap-2 px-4 sm:px-8 mt-6">
        <Button
          variant="outline"
          size="icon"
          onClick={() => api?.scrollPrev()}
          disabled={!canScrollPrev}
          className="h-10 w-10 rounded-full bg-background shadow-xs"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => api?.scrollNext()}
          disabled={!canScrollNext}
          className="h-10 w-10 rounded-full bg-background shadow-xs"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default AppleCardCarousel;

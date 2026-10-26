"use client";
import { Popover as Primitive } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";
export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export const PopoverTitle = Primitive.Title;
export const PopoverDescription = Primitive.Description;
export const PopoverClose = Primitive.Close;
export function PopoverContent({
  children,
  className,
  anchor,
  side = "right",
  align = "start",
  ...props
}: Primitive.Popup.Props &
  Pick<Primitive.Positioner.Props, "anchor" | "side" | "align">) {
  return (
    <Primitive.Portal>
      <Primitive.Positioner
        anchor={anchor}
        side={side}
        align={align}
        sideOffset={16}
        collisionPadding={16}
        className="z-40"
      >
        <Primitive.Popup {...props} className={cn("star-popover", className)}>
          {children}
        </Primitive.Popup>
      </Primitive.Positioner>
    </Primitive.Portal>
  );
}

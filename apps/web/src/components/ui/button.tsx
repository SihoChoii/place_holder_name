import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-none border border-transparent bg-clip-padding text-sm/5 font-medium whitespace-nowrap transition-colors duration-150 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:ring-2 focus-visible:ring-background disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        outline:
          "border-input bg-background text-foreground hover:bg-muted aria-expanded:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-muted aria-expanded:bg-secondary",
        ghost:
          "text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive:
          "border-input bg-background text-destructive hover:bg-muted",
        link: "text-primary underline-offset-4 hover:underline",
        row: "w-full justify-start whitespace-normal text-left text-base font-medium text-foreground hover:bg-transparent",
      },
      size: {
        default:
          "min-h-11 gap-2 px-4 py-2",
        xs: "min-h-11 gap-1 px-2 py-2",
        sm: "min-h-11 gap-2 px-3 py-2",
        lg: "min-h-12 gap-2 px-5 py-3",
        icon: "size-11",
        "icon-xs":
          "size-11",
        "icon-sm":
          "size-11",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

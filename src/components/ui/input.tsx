import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-xl border border-[#6d28d9]/20 bg-white px-3.5 py-2 text-xs font-semibold text-[#0f172a] shadow-xs transition-all outline-none placeholder:text-slate-400 focus:border-[#6d28d9] focus:ring-2 focus:ring-[#6d28d9]/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }

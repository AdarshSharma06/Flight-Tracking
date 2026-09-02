import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">404 — Not Found</h1>
      <p className="text-muted-foreground text-sm">The page you are looking for does not exist.</p>
      <Link to="/" className={cn(buttonVariants({ variant: "default" }))}>
        Go home
      </Link>
    </div>
  );
}

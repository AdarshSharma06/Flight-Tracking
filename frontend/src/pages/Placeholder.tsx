type PlaceholderProps = {
  title: string;
  description?: string;
  route: string;
};

export function Placeholder({ title, description, route }: PlaceholderProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">
          {description ?? `Placeholder for ${route}. Content will be implemented in later phases.`}
        </p>
      </div>
      <div className="rounded-lg border bg-card text-card-foreground p-6">
        <p className="text-sm text-muted-foreground">
          Route: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{route}</code>
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          This is a routing placeholder to verify React Router is working. No feature UI is implemented yet.
        </p>
      </div>
    </div>
  );
}

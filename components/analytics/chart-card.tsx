import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0 border-border/70 bg-card/50">
      <CardHeader className="min-w-0">
        <CardTitle className="min-w-0 break-words">{title}</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 overflow-hidden">{children}</CardContent>
    </Card>
  );
}

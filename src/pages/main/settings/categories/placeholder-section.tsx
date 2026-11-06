import { Card, CardContent } from "@/components/ui/card";

export default function PlaceholderSection({ title }: { title: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
        {title}
      </CardContent>
    </Card>
  );
}

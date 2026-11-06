import BlankCard from "@/pages/main/pages/blank/blank-card";
import type { BlankCardProps } from "@/pages/main/pages/blank/types";

export default function BlankPageContent(props: BlankCardProps) {
  return <BlankCard {...props} />;
}

export { default as BlankCard } from "@/pages/main/pages/blank/blank-card";
export * from "@/pages/main/pages/blank/types";

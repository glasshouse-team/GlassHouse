import { ComingSoon } from "@/components/ui/coming-soon";

// Trip page with "Film your arrival" check-in verification (GH-23, Beka, stretch).
export default async function TripPage(props: PageProps<"/trip/[id]">) {
  const { id } = await props.params;
  return <ComingSoon title={`Trip ${id}: check-in verification`} ticket="GH-23" owner="Beka" />;
}

import { redirect } from "next/navigation";

// The home page is the search page (docs/teardown.md): a guest starts at the trip brief box.
export default function HomePage() {
  redirect("/search");
}

import type { Metadata } from "next";
import LiviCompanion from "./LiviCompanion";

export const metadata: Metadata = {
  title: "LIVI — A living virtual companion",
  description:
    "Care for a persistent artificial organism whose cells, behavior, and bond grow from underlying rules.",
};

export default function Home() {
  return <LiviCompanion />;
}

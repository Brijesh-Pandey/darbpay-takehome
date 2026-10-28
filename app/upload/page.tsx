import type { Metadata } from "next";
import { UploadDesk } from "./upload-desk";

export const metadata: Metadata = {
  title: "Upload",
};

export default function UploadPage() {
  return <UploadDesk />;
}

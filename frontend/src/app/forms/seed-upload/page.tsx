import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import { SeedUploadForm } from "./_components/seed-upload-form";

export const metadata: Metadata = {
  title: "Seed Data Upload",
  description: "Upload previous year historical data for hotel onboarding",
};

export default function SeedUploadPage() {
  return (
    <>
      <Breadcrumb pageName="Seed Data Upload" />
      <div className="grid grid-cols-1 gap-9">
        <SeedUploadForm />
      </div>
    </>
  );
}


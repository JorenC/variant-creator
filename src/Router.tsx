import { createBrowserRouter, Outlet, ScrollRestoration } from "react-router-dom";
import { HomePage } from "@/components/HomePage";
import { PreparingMapPage } from "@/components/PreparingMapPage";
import { VectorizeWithAIPage } from "@/components/VectorizeWithAIPage";
import { StyleMapPage } from "@/components/StyleMapPage";
import { DSvgCreator } from "@/components/dsvg/DSvgCreator";
import { DvarCreator } from "@/components/dvar/DvarCreator";
import { UploadDiplicityPage } from "@/components/UploadDiplicityPage";

function RootLayout() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: "/",
        element: <HomePage />,
      },
      {
        path: "/preparing-your-map",
        element: <PreparingMapPage />,
      },
      {
        path: "/vectorize-with-ai",
        element: <VectorizeWithAIPage />,
      },
      {
        path: "/style-map",
        element: <StyleMapPage />,
      },
      {
        path: "/dsvg-creator",
        element: <DSvgCreator />,
      },
      {
        path: "/dvar-creator",
        element: <DvarCreator />,
      },
      {
        path: "/upload-diplicity",
        element: <UploadDiplicityPage />,
      },
    ],
  },
]);

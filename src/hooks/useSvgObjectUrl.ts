import { useEffect, useState } from "react";

/**
 * Wraps an SVG string in a Blob object URL for use as an `<img src>`, revoking the
 * previous URL whenever the SVG changes or the component unmounts. Returns `null`
 * until the first URL is created.
 */
export function useSvgObjectUrl(svg: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [svg]);
  return url;
}

import { useEffect, useState } from "react";

/**
 * つながっているかどうか。
 *
 * `navigator.onLine` は「ネットワークにつながっているか」しか見ないので、
 * 電波はあるのにサーバーに届かない状況は拾えない。それでも
 * 「機内モード」「圏外」は拾えるので、オフラインの案内には十分。
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return online;
}

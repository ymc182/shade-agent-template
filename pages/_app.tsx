import "../styles/globals.css";
import "@near-wallet-selector/modal-ui/styles.css";
import type { AppProps } from "next/app";

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

export default MyApp;

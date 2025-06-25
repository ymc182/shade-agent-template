import styles from "../styles/Home.module.css";
import { Message } from "../types";

interface OverlayProps {
  message: Message | "";
}

export default function Overlay({ message }: OverlayProps) {
  if (!message) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.message}>
        {message.text}
        {!message.success && (
          <div className={styles.spinnerContainer}>
            <img src="/shade-agent.svg" alt="Loading..." className={styles.spinningLogo} />
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { formatBytes, ioStats, type IoStats } from "../lib/ipc";

interface Props {
  t: (key: string, vars?: Record<string, string | number>) => string;
  speed: number;
  done: number;
  total: number;
  percent: number;
}

const SAMPLES = 48;

function formatRate(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB/s";
  if (bytes < 1024) return `${Math.round(bytes)} B/s`;
  const units = ["KB/s", "MB/s", "GB/s"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function formatEta(done: number, total: number, speed: number): string | null {
  if (speed <= 0 || total <= done) return null;
  const seconds = Math.round((total - done) / speed);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const tail = `${minutes}:${String(rest).padStart(2, "0")}`;
  if (hours === 0) return tail;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function Sparkline({ values, disk = false }: { values: number[]; disk?: boolean }) {
  const width = 100;
  const height = 30;
  const peak = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => {
    const x = values.length > 1 ? index * step : width;
    const y = height - 3 - (value / peak) * (height - 6);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = points.length > 1 ? points.join(" ") : `0,${height - 3} ${width},${height - 3}`;
  return (
    <svg
      className={"dm-graph" + (disk ? " is-disk" : "")}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon points={`0,${height} ${line} ${width},${height}`} />
      <polyline points={line} />
    </svg>
  );
}

/* Steam-style throughput card, shown while hovering the download button. */
export default function DownloadMonitor({ t, speed, done, total, percent }: Props) {
  const [net, setNet] = useState<number[]>([]);
  const [diskRead, setDiskRead] = useState<number[]>([]);
  const [diskWrite, setDiskWrite] = useState<number[]>([]);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    let cancelled = false;
    let last: IoStats | null = null;
    const sample = async () => {
      try {
        const next = await ioStats();
        if (cancelled) return;
        const previous = last;
        if (previous) {
          setDiskRead((prev) => [...prev, Math.max(0, next.read - previous.read)].slice(-SAMPLES));
          setDiskWrite((prev) => [...prev, Math.max(0, next.write - previous.write)].slice(-SAMPLES));
        }
        last = next;
        setNet((prev) => [...prev, speedRef.current].slice(-SAMPLES));
      } catch {
        /* A failed sample keeps the previous graph. */
      }
    };
    void sample();
    const timer = window.setInterval(() => void sample(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const currentNet = speed > 0 ? speed : net.length > 0 ? net[net.length - 1] : 0;
  const currentRead = diskRead.length > 0 ? diskRead[diskRead.length - 1] : 0;
  const currentWrite = diskWrite.length > 0 ? diskWrite[diskWrite.length - 1] : 0;
  const eta = formatEta(done, total, currentNet);
  const width = Math.min(100, Math.max(0, percent));

  return (
    <div className="download-monitor" aria-hidden="true">
      <div className="dm-head">
        <span className="dm-title">{t("download.monitor.title")}</span>
        <span className="dm-pct">{percent}%</span>
      </div>

      <div className="dm-row">
        <span className="dm-label">{t("download.monitor.network")}</span>
        <span className="dm-value">{formatRate(currentNet)}</span>
      </div>
      <Sparkline values={net} />

      <div className="dm-row">
        <span className="dm-label">{t("download.monitor.disk")}</span>
        <span className="dm-value dm-io">
          <span>
            <em>{t("download.monitor.read")}</em>
            {formatRate(currentRead)}
          </span>
          <span>
            <em>{t("download.monitor.write")}</em>
            {formatRate(currentWrite)}
          </span>
        </span>
      </div>
      <Sparkline values={diskWrite} disk />

      <div className="dm-track">
        <span style={{ width: `${width}%` }} />
      </div>
      <div className="dm-meta">
        <span>
          {formatBytes(done)} / {formatBytes(total)}
        </span>
        {eta && (
          <span>
            {t("download.monitor.eta")} {eta}
          </span>
        )}
      </div>
    </div>
  );
}

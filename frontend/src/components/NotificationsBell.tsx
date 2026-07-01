import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

interface Notif {
  id: string;
  type: string;
  titre: string;
  message: string;
  lien?: string | null;
  lu: boolean;
  createdAt: string;
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [nonLues, setNonLues] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api
      .get<{ items: Notif[]; nonLues: number }>("/notifications")
      .then((d) => {
        setItems(d.items);
        setNonLues(d.nonLues);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markAll() {
    await api.post("/notifications/lues");
    load();
  }

  async function openNotif(n: Notif) {
    if (!n.lu) await api.post(`/notifications/${n.id}/lu`);
    setOpen(false);
    if (n.lien) navigate(n.lien);
    else load();
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="icon-btn"
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={19} />
        {nonLues > 0 && (
          <span className="notif-badge">{nonLues > 9 ? "9+" : nonLues}</span>
        )}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <strong>Notifications</strong>
            {nonLues > 0 && (
              <button
                className="btn btn-ghost"
                style={{ padding: "4px 8px", fontSize: 12 }}
                onClick={markAll}
              >
                <Check size={13} /> Tout marquer lu
              </button>
            )}
          </div>
          <div className="notif-list">
            {items.length === 0 && (
              <div className="empty" style={{ padding: 20 }}>
                Aucune notification.
              </div>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                className={`notif-item${n.lu ? "" : " unread"}`}
                onClick={() => openNotif(n)}
              >
                <div className="notif-title">{n.titre}</div>
                <div className="notif-msg">{n.message}</div>
                <div className="notif-date">
                  {new Date(n.createdAt).toLocaleString("fr-FR")}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

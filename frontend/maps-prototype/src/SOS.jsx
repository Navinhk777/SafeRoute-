import { useEffect, useState } from "react";

const STORAGE_KEY = "saferoute.trustedContacts";
const MAX_CONTACTS = 5;

function readContacts() {
  try {
    const contacts = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(contacts) ? contacts.slice(0, MAX_CONTACTS) : [];
  } catch {
    return [];
  }
}

function normalizePhone(phone) {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export default function SOS() {
  const [contactsOpen, setContactsOpen] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);
  const [contacts, setContacts] = useState(readContacts);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [sosStatus, setSosStatus] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const [locationReady, setLocationReady] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  }, [contacts]);

  function saveContact(event) {
    event.preventDefault();

    const normalized = normalizePhone(phone);
    if (!name.trim()) {
      setContactMessage("Enter the contact name.");
      return;
    }
    if (!normalized.startsWith("+") || normalized.replace(/\D/g, "").length < 8) {
      setContactMessage("Enter a phone number with its country code.");
      return;
    }
    if (contacts.length >= MAX_CONTACTS) {
      setContactMessage("You can save up to 5 trusted contacts.");
      return;
    }

    setContacts([...contacts, { name: name.trim(), phone: normalized }]);
    setName("");
    setPhone("");
    setContactMessage("Trusted contact saved.");
  }

  function removeContact(index) {
    setContacts(contacts.filter((_, contactIndex) => contactIndex !== index));
  }

  function openSOS() {
    setSosOpen(true);
    setLocationMessage("");
    setLocationReady(false);

    if (!navigator.geolocation) {
      setSosStatus("Location is unavailable in this browser.");
      return;
    }

    setSosStatus("Getting your live location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const time = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        setLocationMessage(
          `SOS! I need help. My location: https://maps.google.com/?q=${lat},${lon}  Time: ${time}`
        );
        setSosStatus("Live location ready.");
        setLocationReady(true);
      },
      (error) => {
        setLocationReady(false);
        if (error.code === 1) {
          setSosStatus("Location permission denied. Enable location permission to send an SOS.");
        } else {
          setSosStatus("Your live location is unavailable. Check location or GPS settings and try again.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function closeModal(setOpen) {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="sos-floating-button"
        aria-haspopup="dialog"
        onClick={openSOS}
      >
        SOS
      </button>

      <button
        type="button"
        className="trusted-contacts-button"
        onClick={() => {
          setContactMessage("");
          setContactsOpen(true);
        }}
      >
        Trusted contacts
      </button>

      {contactsOpen && (
        <div className="sos-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeModal(setContactsOpen);
        }}>
          <section className="sos-modal trusted-contacts-modal" role="dialog" aria-modal="true" aria-labelledby="trusted-title">
            <div className="sos-modal-header">
              <h2 id="trusted-title">Trusted contacts</h2>
              <button type="button" className="sos-modal-close" aria-label="Close trusted contacts" onClick={() => closeModal(setContactsOpen)}>×</button>
            </div>

            <form className="trusted-contact-form" onSubmit={saveContact}>
              <label>
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={50} placeholder="Name" />
              </label>
              <label>
                Phone number
                <input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" maxLength={24} placeholder="+91 98765 43210" />
              </label>
              <button type="submit" className="primary-button" disabled={contacts.length >= MAX_CONTACTS}>Save contact</button>
            </form>
            <p className="trusted-contact-limit" role="status">{contactMessage || `${contacts.length} of ${MAX_CONTACTS} trusted contacts saved.`}</p>

            <div className="trusted-contact-list">
              {contacts.map((contact, index) => (
                <div className="trusted-contact-row" key={`${contact.phone}-${index}`}>
                  <div><strong>{contact.name}</strong><span>{contact.phone}</span></div>
                  <button type="button" onClick={() => removeContact(index)}>Remove</button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {sosOpen && (
        <div className="sos-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeModal(setSosOpen);
        }}>
          <section className="sos-modal" role="dialog" aria-modal="true" aria-labelledby="sos-title">
            <div className="sos-modal-header">
              <h2 id="sos-title">Emergency SOS</h2>
              <button type="button" className="sos-modal-close" aria-label="Close SOS" onClick={() => closeModal(setSosOpen)}>×</button>
            </div>

            <p className={`sos-status ${locationReady ? "ready" : ""}`} role="status" aria-live="polite">{sosStatus}</p>

            {locationReady && (
              <>
                <pre className="sos-location-message">{locationMessage}</pre>
                <div className="sos-contact-actions">
                  {contacts.map((contact, index) => {
                    const whatsappNumber = normalizePhone(contact.phone).replace(/\+/g, "");
                    return (
                      <div className="sos-contact-row" key={`${contact.phone}-${index}`}>
                        <strong>{contact.name}</strong>
                        <a
                          className="sos-whatsapp"
                          href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(locationMessage)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          WhatsApp
                        </a>
                        <a
                          className="sos-sms"
                          href={`sms:${normalizePhone(contact.phone)}?body=${encodeURIComponent(locationMessage)}`}
                        >
                          SMS
                        </a>
                      </div>
                    );
                  })}
                  <a className="sos-call" href="tel:112">Call 112</a>
                </div>
                <p className="sos-share-note">Your phone will open the message. Tap send to share it.</p>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

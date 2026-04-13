'use client';

import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';

const INQUIRY_TYPES = [
  'General Support',
  'Enterprise Sales',
  'Partnerships',
  'Billing Question',
  'Feature Request',
  'Bug Report',
  'Other',
];

interface FormErrors {
  name?: string;
  email?: string;
  subject?: string;
  inquiryType?: string;
  message?: string;
  turnstile?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [inquiryType, setInquiryType] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState('');

  // Turnstile state
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const renderTurnstile = useCallback(() => {
    if (!TURNSTILE_SITE_KEY || !turnstileRef.current || !window.turnstile) return;
    // Avoid double-rendering
    if (widgetIdRef.current !== null) return;

    widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token: string) => {
        setTurnstileToken(token);
        setErrors((p) => ({ ...p, turnstile: undefined }));
      },
      'expired-callback': () => setTurnstileToken(''),
      'error-callback': () => setTurnstileToken(''),
      theme: 'light',
    });
  }, []);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;

    // If the Turnstile API is already loaded, render immediately
    if (window.turnstile) {
      renderTurnstile();
      return;
    }

    // Load the Turnstile script
    const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => renderTurnstile();
      document.head.appendChild(script);
    } else {
      // Script tag exists but may still be loading
      existing.addEventListener('load', () => renderTurnstile());
      // In case it already loaded
      if (window.turnstile) renderTurnstile();
    }

    return () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [renderTurnstile]);

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!name.trim()) errs.name = 'Full name is required.';
    if (!email.trim()) {
      errs.email = 'Email address is required.';
    } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim())) {
      errs.email = 'Please enter a valid email address.';
    }
    if (!subject.trim()) errs.subject = 'Subject is required.';
    if (!inquiryType) errs.inquiryType = 'Please select an inquiry type.';
    if (!message.trim()) {
      errs.message = 'Message is required.';
    } else if (message.trim().length < 20) {
      errs.message = 'Message must be at least 20 characters.';
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      errs.turnstile = 'Please complete the security challenge.';
    }
    return errs;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError('');
    setSuccess(false);

    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          inquiryType,
          message: message.trim(),
          turnstileToken: turnstileToken || undefined,
          // Honeypot field — real users never see or fill this
          website: (document.getElementById('contact-website') as HTMLInputElement)?.value || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error || 'Something went wrong. Please try again.');
        // Reset Turnstile on failure so user can retry
        if (widgetIdRef.current !== null && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
          setTurnstileToken('');
        }
        return;
      }
      setSuccess(true);
      setName('');
      setEmail('');
      setSubject('');
      setInquiryType('');
      setMessage('');
      setErrors({});
      setTurnstileToken('');
      // Reset Turnstile widget for next submission
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
    } catch {
      setServerError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = (field: keyof FormErrors) =>
    `w-full px-4 py-2.5 rounded-lg border bg-white text-gray-900 text-sm outline-none transition-colors ${
      errors[field]
        ? 'border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-200'
        : 'border-gray-300 focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]/20'
    }`;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm">
          Thank you! We&apos;ll get back to you within 24 hours.
        </div>
      )}
      {serverError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {serverError}
        </div>
      )}

      {/* Honeypot field — hidden from real users, bots will fill it */}
      <div aria-hidden="true" tabIndex={-1} style={{ position: 'absolute', left: '-9999px', top: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }}>
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {/* Name */}
      <div>
        <label htmlFor="contact-name" className="block text-sm font-medium text-gray-700 mb-1.5">
          Full Name
        </label>
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((p) => ({ ...p, name: undefined })); }}
          className={inputClass('name')}
          placeholder="John Doe"
        />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
      </div>

      {/* Email */}
      <div>
        <label htmlFor="contact-email" className="block text-sm font-medium text-gray-700 mb-1.5">
          Email Address
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); }}
          className={inputClass('email')}
          placeholder="john@example.com"
        />
        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
      </div>

      {/* Subject */}
      <div>
        <label htmlFor="contact-subject" className="block text-sm font-medium text-gray-700 mb-1.5">
          Subject
        </label>
        <input
          id="contact-subject"
          type="text"
          value={subject}
          onChange={(e) => { setSubject(e.target.value); if (errors.subject) setErrors((p) => ({ ...p, subject: undefined })); }}
          className={inputClass('subject')}
          placeholder="How can we help?"
        />
        {errors.subject && <p className="text-red-500 text-xs mt-1">{errors.subject}</p>}
      </div>

      {/* Inquiry Type */}
      <div>
        <label htmlFor="contact-inquiry" className="block text-sm font-medium text-gray-700 mb-1.5">
          Inquiry Type
        </label>
        <select
          id="contact-inquiry"
          value={inquiryType}
          onChange={(e) => { setInquiryType(e.target.value); if (errors.inquiryType) setErrors((p) => ({ ...p, inquiryType: undefined })); }}
          className={inputClass('inquiryType')}
        >
          <option value="">Select an inquiry type</option>
          {INQUIRY_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {errors.inquiryType && <p className="text-red-500 text-xs mt-1">{errors.inquiryType}</p>}
      </div>

      {/* Message */}
      <div>
        <label htmlFor="contact-message" className="block text-sm font-medium text-gray-700 mb-1.5">
          Message
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => { setMessage(e.target.value); if (errors.message) setErrors((p) => ({ ...p, message: undefined })); }}
          className={`${inputClass('message')} resize-y min-h-[120px]`}
          rows={5}
          placeholder="Tell us more about your inquiry (at least 20 characters)..."
        />
        {errors.message && <p className="text-red-500 text-xs mt-1">{errors.message}</p>}
      </div>

      {/* Cloudflare Turnstile widget */}
      {TURNSTILE_SITE_KEY && (
        <div>
          <div ref={turnstileRef} />
          {errors.turnstile && <p className="text-red-500 text-xs mt-1">{errors.turnstile}</p>}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 px-6 rounded-lg font-medium text-white text-sm transition-opacity disabled:opacity-60"
        style={{ backgroundColor: 'var(--brand)' }}
      >
        {loading ? 'Sending...' : 'Send Message'}
      </button>
    </form>
  );
}

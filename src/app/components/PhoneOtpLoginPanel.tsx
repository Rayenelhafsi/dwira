import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { AuthUser, requestPhoneOtp, verifyPhoneOtp } from '../services/auth';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './ui/input-otp';

interface PhoneOtpLoginPanelProps {
  title: string;
  description: string;
  submitLabel?: string;
  verifyLabel?: string;
  initialPhone?: string;
  onSuccess: (user: AuthUser) => void | Promise<void>;
}

const DEFAULT_PHONE = '+216';

export default function PhoneOtpLoginPanel({
  title,
  description,
  submitLabel = 'Recevoir le code',
  verifyLabel = 'Valider et continuer',
  initialPhone = DEFAULT_PHONE,
  onSuccess,
}: PhoneOtpLoginPanelProps) {
  const [telephone, setTelephone] = useState(initialPhone);
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [expiresInSeconds, setExpiresInSeconds] = useState(0);

  useEffect(() => {
    if (step !== 'code' || expiresInSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setExpiresInSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [step, expiresInSeconds]);

  const handleRequestOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await requestPhoneOtp(telephone);
      setStep('code');
      setCode('');
      setExpiresInSeconds(Number(response.expiresInSeconds || 300));
      toast.success('Code envoye sur votre numero.');
      if (response.debugCode) {
        toast.info(`Code de test: ${response.debugCode}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'envoyer le code OTP");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (code.trim().length !== 6) {
      toast.error('Saisissez le code a 6 chiffres');
      return;
    }
    setIsVerifying(true);
    try {
      const user = await verifyPhoneOtp(telephone, code.trim());
      await onSuccess(user);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Verification OTP impossible');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
        <MessageCircle className="h-4 w-4" />
        {title}
      </div>
      <p className="mt-1 text-xs text-emerald-800/80">{description}</p>

      {step === 'phone' ? (
        <form className="mt-3 space-y-3" onSubmit={handleRequestOtp}>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={telephone}
            onChange={(event) => setTelephone(event.target.value)}
            placeholder="+216 52 080 695"
            className="w-full rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MessageCircle className="h-4 w-4" />
            {isSubmitting ? 'Envoi...' : submitLabel}
          </button>
        </form>
      ) : (
        <form className="mt-3 space-y-3" onSubmit={handleVerifyOtp}>
          <div className="rounded-md border border-emerald-200 bg-white px-3 py-3">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={setCode}
              containerClassName="justify-between"
              className="w-full"
            >
              <InputOTPGroup className="w-full justify-between">
                <InputOTPSlot index={0} className="h-11 w-11 rounded-md border text-base" />
                <InputOTPSlot index={1} className="h-11 w-11 rounded-md border text-base" />
                <InputOTPSlot index={2} className="h-11 w-11 rounded-md border text-base" />
                <InputOTPSlot index={3} className="h-11 w-11 rounded-md border text-base" />
                <InputOTPSlot index={4} className="h-11 w-11 rounded-md border text-base" />
                <InputOTPSlot index={5} className="h-11 w-11 rounded-md border text-base" />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <p className="text-xs text-emerald-800/80">
            Code envoye au {telephone}. {expiresInSeconds > 0 ? `Expire dans ${expiresInSeconds}s.` : ''}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setCode('');
              }}
              className="inline-flex flex-1 items-center justify-center rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              Changer le numero
            </button>
            <button
              type="submit"
              disabled={isVerifying}
              className="inline-flex flex-1 items-center justify-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isVerifying ? 'Verification...' : verifyLabel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

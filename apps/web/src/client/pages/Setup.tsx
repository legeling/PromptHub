import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

export function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    getCaptcha,
    register,
    isAuthenticated,
    isBootstrapLoading,
    isInitialized,
    captchaEnabled,
  } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaImageData, setCaptchaImageData] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const canSubmit =
    (!captchaEnabled || (!captchaLoading && Boolean(captchaId))) &&
    !isSubmitting;

  useEffect(() => {
    let cancelled = false;

    const loadCaptcha = async () => {
      if (!captchaEnabled) {
        setCaptchaLoading(false);
        setCaptchaId('');
        setCaptchaImageData('');
        setCaptchaAnswer('');
        return;
      }

      setCaptchaLoading(true);
      try {
        const captcha = await getCaptcha();
        if (!cancelled) {
          setCaptchaId(captcha.captchaId);
          setCaptchaImageData(captcha.imageData);
          setCaptchaAnswer('');
        }
      } catch (captchaError: unknown) {
        if (!cancelled) {
          setCaptchaId('');
          setCaptchaImageData('');
          setCaptchaAnswer('');
          setError(
            captchaError instanceof Error
              ? captchaError.message
              : t('common.requestFailed'),
          );
        }
      } finally {
        if (!cancelled) {
          setCaptchaLoading(false);
        }
      }
    };

    void loadCaptcha();

    return () => {
      cancelled = true;
    };
  }, [captchaEnabled, getCaptcha, t]);

  const refreshCaptcha = async () => {
    if (!captchaEnabled) {
      return;
    }

    setCaptchaLoading(true);
    try {
      const captcha = await getCaptcha();
      setCaptchaId(captcha.captchaId);
      setCaptchaImageData(captcha.imageData);
      setCaptchaAnswer('');
      setError(null);
    } catch (captchaError: unknown) {
      setCaptchaId('');
      setCaptchaImageData('');
      setCaptchaAnswer('');
      setError(
        captchaError instanceof Error
          ? captchaError.message
          : t('common.requestFailed'),
      );
    } finally {
      setCaptchaLoading(false);
    }
  };

  if (isBootstrapLoading) {
    return <div className="loading-screen">{t('dashboard.loading')}</div>;
  }

  if (isInitialized) {
    return <Navigate to={isAuthenticated ? '/' : '/login'} replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      isSubmittingRef.current ||
      (captchaEnabled && (!captchaId || captchaLoading))
    ) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setError(null);

    if (password !== confirmPassword) {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setError(t('auth.setupPasswordMismatch'));
      return;
    }

    try {
      await register({
        username,
        password,
        ...(captchaEnabled ? { captchaId, captchaAnswer } : {}),
      });
      navigate('/', { replace: true });
    } catch (setupError: unknown) {
      try {
        await refreshCaptcha();
      } catch (captchaRefreshError: unknown) {
        console.error('Failed to refresh captcha after setup error:', captchaRefreshError);
      }
      if (setupError instanceof Error && setupError.message) {
        setError(setupError.message);
      } else {
        setError(t('auth.setupError'));
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-container prompthub-web-auth">
      <div className="login-card setup-card rounded-[32px] border border-slate-200/80 bg-white/95 p-9 shadow-[0_32px_90px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="setup-badge">{t('auth.setupBadge')}</div>
        <h1 className="login-title text-3xl font-semibold text-slate-900">
          {t('auth.setupTitle')}
        </h1>
        <p className="setup-lead">{t('auth.setupDescription')}</p>
        <p className="setup-hint">{t('auth.setupHint')}</p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group web-auth-captcha-group">
            <label
              htmlFor="setup-username"
              className="text-sm font-semibold text-slate-700"
            >
              {t('auth.username')}
            </label>
            <input
              id="setup-username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoFocus
              className="web-auth-input"
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="setup-password"
              className="text-sm font-semibold text-slate-700"
            >
              {t('auth.password')}
            </label>
            <input
              id="setup-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="web-auth-input"
            />
          </div>

          <div className="form-group">
            <label
              htmlFor="setup-confirm-password"
              className="text-sm font-semibold text-slate-700"
            >
              {t('auth.confirmPassword')}
            </label>
            <input
              id="setup-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              className="web-auth-input"
            />
          </div>

          {captchaEnabled ? (
            <div className="form-group">
              <label htmlFor="setup-captcha" className="text-sm font-semibold text-slate-700">
                {t('auth.captchaLabel')}
              </label>
              <div className="web-auth-captcha-row">
                <div className="web-auth-captcha-prompt" aria-live="polite">
                  {captchaLoading ? (
                    <span>{t('auth.captchaLoading')}</span>
                  ) : captchaImageData ? (
                    <img
                      src={captchaImageData}
                      alt={t('auth.captchaImageAlt')}
                      className="web-auth-captcha-image"
                    />
                  ) : (
                    <span>{t('common.requestFailed')}</span>
                  )}
                </div>
                <button
                  type="button"
                  className="secondary-button web-auth-captcha-refresh"
                  onClick={() => void refreshCaptcha()}
                  disabled={captchaLoading}
                >
                  {t('auth.captchaRefresh')}
                </button>
              </div>
              <input
                id="setup-captcha"
                type="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                value={captchaAnswer}
                onChange={(event) => setCaptchaAnswer(event.target.value)}
                required
                className="web-auth-input web-auth-captcha-answer"
                placeholder={t('auth.captchaPlaceholder')}
              />
            </div>
          ) : null}

          <button type="submit" className="login-submit web-auth-submit" disabled={!canSubmit}>
            <span className="text-white">{t('auth.completeSetup')}</span>
          </button>
        </form>
      </div>
    </div>
  );
}

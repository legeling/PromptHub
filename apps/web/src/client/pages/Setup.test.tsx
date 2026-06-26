import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SetupPage } from './Setup';
import * as AuthContext from '../contexts/AuthContext';

const { translate } = vi.hoisted(() => ({
  translate: (key: string) => key,
}));

const getCaptchaMock = vi.fn().mockResolvedValue({
  captchaId: '550e8400-e29b-41d4-a716-446655440000',
  expiresInSeconds: 300,
  imageData: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: translate,
  }),
}));

const registerMock = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

function renderSetup(
  overrides?: Partial<ReturnType<typeof AuthContext.useAuth>>,
) {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    login: vi.fn(),
    getCaptcha: getCaptchaMock,
    register: registerMock,
    isAuthenticated: false,
    user: null,
    token: null,
    isLoading: false,
    isBootstrapLoading: false,
    isInitialized: false,
    registrationAllowed: true,
    captchaEnabled: true,
    logout: vi.fn(),
    refreshBootstrap: vi.fn(),
    ...overrides,
  });

  return render(
    <MemoryRouter initialEntries={['/setup']}>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
        <Route path="/login" element={<div data-testid="login">Login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCaptchaMock.mockResolvedValue({
      captchaId: '550e8400-e29b-41d4-a716-446655440000',
      expiresInSeconds: 300,
      imageData: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('creates the first account through the setup flow', async () => {
    registerMock.mockResolvedValueOnce(undefined);
    renderSetup();

    fireEvent.change(screen.getByLabelText('auth.username'), {
      target: { value: 'owner' },
    });
    fireEvent.change(screen.getByLabelText('auth.password'), {
      target: { value: 'debugpass001' },
    });
    fireEvent.change(screen.getByLabelText('auth.confirmPassword'), {
      target: { value: 'debugpass001' },
    });
    const captchaInput = await screen.findByLabelText('auth.captchaLabel', { selector: 'input' });
    fireEvent.change(captchaInput, {
      target: { value: '7' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'auth.completeSetup' }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith({
        username: 'owner',
        password: 'debugpass001',
        captchaId: '550e8400-e29b-41d4-a716-446655440000',
        captchaAnswer: '7',
      });
    });
  });

  it('shows a validation error when the passwords do not match', async () => {
    renderSetup();

    fireEvent.change(screen.getByLabelText('auth.username'), {
      target: { value: 'owner' },
    });
    fireEvent.change(screen.getByLabelText('auth.password'), {
      target: { value: 'debugpass001' },
    });
    fireEvent.change(screen.getByLabelText('auth.confirmPassword'), {
      target: { value: 'debugpass002' },
    });
    fireEvent.change(await screen.findByLabelText('auth.captchaLabel', { selector: 'input' }), {
      target: { value: '7' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'auth.completeSetup' }));

    expect(await screen.findByText('auth.setupPasswordMismatch')).toBeTruthy();
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('ignores duplicate submits while registration is in flight', async () => {
    registerMock.mockReturnValueOnce(new Promise(() => {}));
    renderSetup();

    fireEvent.change(screen.getByLabelText('auth.username'), {
      target: { value: 'owner' },
    });
    fireEvent.change(screen.getByLabelText('auth.password'), {
      target: { value: 'debugpass001' },
    });
    fireEvent.change(screen.getByLabelText('auth.confirmPassword'), {
      target: { value: 'debugpass001' },
    });
    fireEvent.change(await screen.findByLabelText('auth.captchaLabel', { selector: 'input' }), {
      target: { value: '7' },
    });

    const submitButton = screen.getByRole('button', { name: 'auth.completeSetup' });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledTimes(1);
    });
  });

  it('redirects to login when the instance is already initialized', () => {
    renderSetup({ isInitialized: true });

    expect(screen.getByTestId('login')).toBeTruthy();
  });

  it('does not render an empty captcha image when captcha loading fails', async () => {
    renderSetup({
      getCaptcha: vi.fn().mockRejectedValue(new Error('Captcha unavailable')),
    });

    expect(await screen.findByText('Captcha unavailable')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'auth.captchaImageAlt' })).toBeNull();
    expect(screen.getByText('common.requestFailed')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'auth.completeSetup' }).disabled).toBe(true);
  });

  it('hides captcha and creates the first account when captcha is disabled', async () => {
    const getCaptcha = vi.fn();
    registerMock.mockResolvedValueOnce(undefined);
    renderSetup({
      captchaEnabled: false,
      getCaptcha,
    });

    expect(screen.queryByLabelText('auth.captchaLabel')).toBeNull();
    expect(screen.queryByRole('button', { name: 'auth.captchaRefresh' })).toBeNull();
    expect(getCaptcha).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('auth.username'), {
      target: { value: 'owner' },
    });
    fireEvent.change(screen.getByLabelText('auth.password'), {
      target: { value: 'debugpass001' },
    });
    fireEvent.change(screen.getByLabelText('auth.confirmPassword'), {
      target: { value: 'debugpass001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'auth.completeSetup' }));

    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith({
        username: 'owner',
        password: 'debugpass001',
      });
    });
  });
});

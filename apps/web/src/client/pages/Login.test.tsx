import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from './Login';
import * as AuthContext from '../contexts/AuthContext';

const { translate } = vi.hoisted(() => ({
  translate: (key: string) => key,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: translate,
  }),
}));

const loginMock = vi.fn();
type AuthValue = ReturnType<typeof AuthContext.useAuth>;
type InitialEntries = ComponentProps<typeof MemoryRouter>['initialEntries'];

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

function createAuthValue(isAuthenticated: boolean): AuthValue {
  return {
    getCaptcha: vi.fn().mockResolvedValue({
      captchaId: '550e8400-e29b-41d4-a716-446655440000',
      expiresInSeconds: 300,
      imageData: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    }),
    login: loginMock,
    register: vi.fn(),
    isAuthenticated,
    user: null,
    token: null,
    isLoading: false,
    isBootstrapLoading: false,
    isInitialized: true,
    registrationAllowed: true,
    captchaEnabled: true,
    logout: vi.fn(),
    refreshBootstrap: vi.fn(),
  };
}

function TestWrapper({
  isAuthenticated = false,
  initialEntries = ['/login'] as InitialEntries,
  authOverrides,
}: {
  isAuthenticated?: boolean;
  initialEntries?: InitialEntries;
  authOverrides?: Partial<AuthValue>;
}) {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    ...createAuthValue(isAuthenticated),
    ...authOverrides,
  });

  return (
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div data-testid="home">Home</div>} />
          <Route path="/target" element={<div data-testid="target">Target</div>} />
        </Routes>
      </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('redirects if already authenticated', () => {
    render(<TestWrapper isAuthenticated={true} />);
    expect(screen.getByTestId('home')).toBeTruthy();
  });

  it('redirects to setup when bootstrap is not initialized', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      ...createAuthValue(false),
      isInitialized: false,
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<div data-testid="setup">Setup</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('setup')).toBeTruthy();
  });

  it('redirects to specific path if provided in state', () => {
    const initialEntries: InitialEntries = [{ pathname: '/login', state: { from: { pathname: '/target' } } }];
    render(<TestWrapper isAuthenticated={true} initialEntries={initialEntries} />);
    expect(screen.getByTestId('target')).toBeTruthy();
  });

  it('renders login form and calls login on submit', async () => {
    render(<TestWrapper isAuthenticated={false} />);
    
    expect(screen.getByRole('heading', { name: 'auth.loginTitle' })).toBeTruthy();
    expect(screen.getByText('auth.loginDescription')).toBeTruthy();
    expect(screen.queryByText('auth.setupDescription')).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'auth.captchaImageAlt' })).toBeTruthy();
    });
    
    const usernameInput = screen.getByLabelText('auth.username');
    const passwordInput = screen.getByLabelText('auth.password');
    const captchaInput = screen.getByLabelText('auth.captchaLabel', { selector: 'input' });
    const submitBtn = screen.getByRole('button', { name: 'auth.signIn' });

    fireEvent.change(usernameInput, { target: { value: 'user' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(captchaInput, { target: { value: '7' } });
    
    loginMock.mockResolvedValueOnce(undefined);
    
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({
        username: 'user',
        password: 'password123',
        captchaId: '550e8400-e29b-41d4-a716-446655440000',
        captchaAnswer: '7',
      });
    });
  });

  it('shows error when login fails', async () => {
    render(<TestWrapper isAuthenticated={false} />);
    
    const usernameInput = screen.getByLabelText('auth.username');
    const passwordInput = screen.getByLabelText('auth.password');
    const captchaInput = screen.getByLabelText('auth.captchaLabel', { selector: 'input' });
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'auth.captchaImageAlt' })).toBeTruthy();
    });
    fireEvent.change(usernameInput, { target: { value: 'user' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(captchaInput, { target: { value: '7' } });

    loginMock.mockRejectedValueOnce(new Error('Bad credentials'));
    
    fireEvent.click(screen.getByRole('button', { name: 'auth.signIn' }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({
        username: 'user',
        password: 'password123',
        captchaId: '550e8400-e29b-41d4-a716-446655440000',
        captchaAnswer: '7',
      });
    });

    expect(await screen.findByText('Bad credentials')).toBeTruthy();
  });

  it('ignores duplicate submits while login is in flight', async () => {
    render(<TestWrapper isAuthenticated={false} />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'auth.captchaImageAlt' })).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('auth.username'), {
      target: { value: 'user' },
    });
    fireEvent.change(screen.getByLabelText('auth.password'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByLabelText('auth.captchaLabel', { selector: 'input' }), {
      target: { value: '7' },
    });
    loginMock.mockReturnValueOnce(new Promise(() => {}));

    const submitButton = screen.getByRole('button', { name: 'auth.signIn' });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1);
    });
  });

  it('does not expose public registration controls on the login page', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      ...createAuthValue(false),
      registrationAllowed: false,
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'auth.needAccount' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'auth.register' })).toBeNull();
  });

  it('does not render an empty captcha image when captcha loading fails', async () => {
    render(
      <TestWrapper
        authOverrides={{
          getCaptcha: vi.fn().mockRejectedValue(new Error('Captcha unavailable')),
        }}
      />,
    );

    expect(await screen.findByText('Captcha unavailable')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'auth.captchaImageAlt' })).toBeNull();
    expect(screen.getByText('common.requestFailed')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'auth.signIn' }).disabled).toBe(true);
  });

  it('hides captcha and submits credentials when captcha is disabled', async () => {
    const getCaptcha = vi.fn();
    render(
      <TestWrapper
        authOverrides={{
          captchaEnabled: false,
          getCaptcha,
        }}
      />,
    );

    expect(screen.queryByLabelText('auth.captchaLabel')).toBeNull();
    expect(screen.queryByRole('button', { name: 'auth.captchaRefresh' })).toBeNull();
    expect(getCaptcha).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('auth.username'), {
      target: { value: 'user' },
    });
    fireEvent.change(screen.getByLabelText('auth.password'), {
      target: { value: 'password123' },
    });
    loginMock.mockResolvedValueOnce(undefined);

    fireEvent.click(screen.getByRole('button', { name: 'auth.signIn' }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({
        username: 'user',
        password: 'password123',
      });
    });
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '../../../src/renderer/components/ui/Button';

describe('Button Component', () => {
    it('renders button with text', () => {
        render(<Button>Click me</Button>);
        expect(screen.getByText('Click me')).toBeInTheDocument();
    });

    it('handles click events', () => {
        const handleClick = vi.fn();
        render(<Button onClick={handleClick}>Click me</Button>);

        fireEvent.click(screen.getByText('Click me'));
        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('defaults to a non-submit button inside forms', () => {
        const handleSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
        });
        render(
            <form onSubmit={handleSubmit}>
                <Button>Do not submit</Button>
            </form>,
        );

        const button = screen.getByRole('button', { name: 'Do not submit' });
        expect(button).toHaveAttribute('type', 'button');
        fireEvent.click(button);

        expect(handleSubmit).not.toHaveBeenCalled();
    });

    it('preserves explicit submit behavior', () => {
        const handleSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
        });
        render(
            <form onSubmit={handleSubmit}>
                <Button type="submit">Submit</Button>
            </form>,
        );

        const button = screen.getByRole('button', { name: 'Submit' });
        expect(button).toHaveAttribute('type', 'submit');
        fireEvent.click(button);

        expect(handleSubmit).toHaveBeenCalledTimes(1);
    });

    it('renders disabled button', () => {
        render(<Button disabled>Disabled</Button>);
        expect(screen.getByText('Disabled')).toBeDisabled();
    });

    it('applies danger variant classes', () => {
        render(<Button variant="danger">Danger</Button>);
        const button = screen.getByText('Danger');
        expect(button.className).toContain('bg-destructive');
    });

    it('applies size classes', () => {
        render(<Button size="lg">Large</Button>);
        const button = screen.getByText('Large');
        expect(button.className).toContain('h-12');
    });
});

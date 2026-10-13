<?php

declare(strict_types=1);

namespace Urna;

use Urna\Http\HttpException;

/**
 * Acumula erros por campo e lança um único 422 ao final.
 */
final class Validator
{
    /** @var array<string, string> */
    private array $errors = [];

    /**
     * @param array<string, mixed> $input
     */
    public function __construct(private readonly array $input)
    {
    }

    public function string(string $field, int $min, int $max, ?string $label = null, ?string $default = null): string
    {
        $value = $this->input[$field] ?? $default;
        $label ??= $field;

        if (!is_string($value)) {
            $this->errors[$field] = "Informe {$label}.";
            return '';
        }

        $value = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
        $length = mb_strlen($value);

        $subject = mb_strtoupper(mb_substr($label, 0, 1)) . mb_substr($label, 1);
        if ($length < $min) {
            $this->errors[$field] = $min <= 1 ? "Informe {$label}." : "{$subject} deve ter ao menos {$min} caracteres.";
        } elseif ($length > $max) {
            $this->errors[$field] = "{$subject} deve ter no máximo {$max} caracteres.";
        }

        return $value;
    }

    public function error(string $field, string $message): void
    {
        $this->errors[$field] ??= $message;
    }

    public function has(string $field): bool
    {
        return isset($this->errors[$field]);
    }

    public function check(): void
    {
        if ($this->errors !== []) {
            throw HttpException::invalid($this->errors);
        }
    }
}

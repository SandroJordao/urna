<?php

declare(strict_types=1);

namespace Urna\Http;

use RuntimeException;

final class HttpException extends RuntimeException
{
    /**
     * @param array<string, string> $fields Erros de validação por campo.
     */
    public function __construct(
        public readonly int $status,
        string $message,
        public readonly array $fields = [],
    ) {
        parent::__construct($message);
    }

    public static function notFound(string $message = 'Recurso não encontrado.'): self
    {
        return new self(404, $message);
    }

    public static function conflict(string $message): self
    {
        return new self(409, $message);
    }

    /**
     * @param array<string, string> $fields
     */
    public static function invalid(array $fields, string $message = 'Verifique os campos informados.'): self
    {
        return new self(422, $message, $fields);
    }
}

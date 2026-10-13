<?php

declare(strict_types=1);

namespace Urna\Http;

final class Request
{
    /** @var array<string, mixed>|null */
    private ?array $json = null;

    /**
     * @param array<string, mixed> $query
     * @param array<string, mixed> $files
     * @param array<string, string> $headers
     */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        public readonly array $files,
        private readonly array $headers,
        private readonly string $body,
    ) {
    }

    public static function fromGlobals(): self
    {
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr($key, 5)))] = (string) $value;
            }
        }
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $headers['content-type'] = (string) $_SERVER['CONTENT_TYPE'];
        }

        return new self(
            strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            self::resolvePath(),
            $_GET,
            $_FILES,
            $headers,
            (string) file_get_contents('php://input'),
        );
    }

    /**
     * Rota relativa ao diretório da API, funcionando com mod_rewrite
     * (/urna/api/elections), sem ele (/urna/api/index.php/elections) e no
     * servidor embutido do PHP.
     */
    private static function resolvePath(): string
    {
        $uri = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
        $script = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');

        foreach ([$script, dirname($script)] as $prefix) {
            if ($prefix !== '' && $prefix !== '/' && str_starts_with($uri, $prefix)) {
                $uri = substr($uri, strlen($prefix));
                break;
            }
        }

        return '/' . trim($uri, '/');
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }

    /**
     * @return array<string, mixed>
     */
    public function json(): array
    {
        if ($this->json !== null) {
            return $this->json;
        }

        if (trim($this->body) === '') {
            return $this->json = [];
        }

        if (!str_contains($this->header('content-type') ?? '', 'application/json')) {
            throw new HttpException(415, 'Envie o corpo da requisição como application/json.');
        }

        $data = json_decode($this->body, true);
        if (!is_array($data)) {
            throw new HttpException(400, 'JSON inválido.');
        }

        return $this->json = $data;
    }
}

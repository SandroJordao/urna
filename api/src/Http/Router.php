<?php

declare(strict_types=1);

namespace Urna\Http;

final class Router
{
    /** @var list<array{string, string, callable}> */
    private array $routes = [];

    /**
     * Registra uma rota. Segmentos `{nome}` viram parâmetros.
     */
    public function add(string $method, string $pattern, callable $handler): void
    {
        $regex = preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern);
        $this->routes[] = [$method, '#^' . $regex . '$#', $handler];
    }

    public function dispatch(Request $request): mixed
    {
        $allowed = [];

        foreach ($this->routes as [$method, $regex, $handler]) {
            if (!preg_match($regex, $request->path, $matches)) {
                continue;
            }
            if ($method !== $request->method) {
                $allowed[] = $method;
                continue;
            }

            $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
            return $handler($request, ...$params);
        }

        if ($allowed !== []) {
            header('Allow: ' . implode(', ', $allowed));
            throw new HttpException(405, 'Método não permitido.');
        }

        throw HttpException::notFound('Rota não encontrada.');
    }
}

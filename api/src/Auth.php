<?php

declare(strict_types=1);

namespace Urna;

use Urna\Http\HttpException;

/**
 * Autenticação do administrador baseada em sessão PHP.
 */
final class Auth
{
    public function __construct(private readonly string $passwordHash)
    {
    }

    public function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        session_name('urna_session');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Strict',
            'secure' => ($_SERVER['HTTPS'] ?? '') === 'on',
        ]);
        session_start();
    }

    public function isAdmin(): bool
    {
        return ($_SESSION['admin'] ?? false) === true;
    }

    public function requireAdmin(): void
    {
        if (!$this->isAdmin()) {
            throw new HttpException(401, 'Faça login como administrador.');
        }
    }

    public function login(string $password): void
    {
        if (!password_verify($password, $this->passwordHash)) {
            // Atrasa tentativas de força bruta.
            usleep(800_000);
            throw new HttpException(401, 'Senha incorreta.');
        }

        session_regenerate_id(true);
        $_SESSION['admin'] = true;
    }

    public function logout(): void
    {
        $_SESSION = [];
        session_regenerate_id(true);
    }
}

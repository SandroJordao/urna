<?php

/**
 * Roteador para o servidor embutido do PHP (alternativa ao XAMPP):
 *
 *   php -S localhost:8000 server.php
 */

$path = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

if ($path === '/api' || str_starts_with($path, '/api/')) {
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    require __DIR__ . '/api/index.php';
    return true;
}

// Mesmas regras dos .htaccess: votos e código nunca são servidos.
if (str_starts_with($path, '/storage') || preg_match('/\.(php|json|lock)$/i', $path)) {
    http_response_code(403);
    return true;
}

if ($path === '/') {
    header('Location: /public/');
    return true;
}

return false;

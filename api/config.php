<?php

declare(strict_types=1);

/**
 * Configuração padrão da API.
 *
 * Para sobrescrever em uma instalação, crie `api/config.local.php` (ignorado
 * pelo git) retornando apenas as chaves que deseja alterar. Para gerar um novo
 * hash de senha:
 *
 *   php -r "echo password_hash('minha-senha', PASSWORD_DEFAULT);"
 */
$config = [
    // Credenciais do painel. Só o hash da senha fica no código.
    'admin_user' => 'borboleta',
    'admin_password_hash' => '$2y$10$8voQmZYp.ojJtvST7kNIquwna1iDQfZgrDTtZKnpKd4ZYDZaCfR9W',

    'timezone' => 'America/Sao_Paulo',

    'root_dir' => dirname(__DIR__),
    'storage_dir' => dirname(__DIR__) . '/storage/elections',
    'seed_dir' => dirname(__DIR__) . '/storage/seed',
    'uploads_dir' => dirname(__DIR__) . '/uploads',

    'photo' => [
        'max_bytes' => 3 * 1024 * 1024,
        'width' => 480,
        'height' => 600,
        'quality' => 82,
    ],
];

$local = __DIR__ . '/config.local.php';
if (is_file($local)) {
    $config = array_replace_recursive($config, require $local);
}

return $config;

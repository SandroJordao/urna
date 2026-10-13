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
    // Senha padrão: "admin". Troque em config.local.php fora do ambiente local.
    'admin_password_hash' => '$2y$10$kHewmKQOSDgpBSH3/EFbaOusFqVzECBAqScjgkpUGQlbCIn1mTVb2',

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

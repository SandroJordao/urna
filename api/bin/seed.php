<?php

declare(strict_types=1);

/**
 * Restaura as eleições de exemplo (sobrescreve as que tiverem o mesmo nome).
 *
 *   php api/bin/seed.php
 */

use Urna\Seeder;

require dirname(__DIR__) . '/src/bootstrap.php';
$config = require dirname(__DIR__) . '/config.php';

$copied = Seeder::seed($config['storage_dir'], $config['seed_dir'], overwrite: true);

echo $copied === []
    ? "Nenhuma eleição de exemplo encontrada em {$config['seed_dir']}.\n"
    : 'Restauradas: ' . implode(', ', $copied) . "\n";

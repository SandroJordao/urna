<?php

declare(strict_types=1);

namespace Urna;

/**
 * Copia as eleições de exemplo de storage/seed para storage/elections.
 */
final class Seeder
{
    private const MARKER = '.seeded';

    /**
     * Executa só na primeira vez, para que quem clonar o projeto já tenha
     * dados. Depois disso, apagar todas as eleições não as recria.
     */
    public static function seedIfEmpty(string $storageDir, string $seedDir): void
    {
        if (is_file($storageDir . '/' . self::MARKER)) {
            return;
        }

        self::seed($storageDir, $seedDir, overwrite: false);
    }

    /**
     * @return list<string> Arquivos copiados.
     */
    public static function seed(string $storageDir, string $seedDir, bool $overwrite): array
    {
        if (!is_dir($storageDir)) {
            mkdir($storageDir, 0775, true);
        }

        $copied = [];
        foreach (glob($seedDir . '/*.json') ?: [] as $file) {
            $target = $storageDir . '/' . basename($file);
            if ($overwrite || !is_file($target)) {
                copy($file, $target);
                $copied[] = basename($file);
            }
        }

        touch($storageDir . '/' . self::MARKER);

        return $copied;
    }
}

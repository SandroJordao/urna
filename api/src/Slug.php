<?php

declare(strict_types=1);

namespace Urna;

final class Slug
{
    public const PATTERN = '/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/';

    /**
     * Tabela própria em vez de iconv TRANSLIT/intl, cujo resultado varia
     * conforme o sistema (no Windows "í" vira "'i").
     */
    private const ACCENTS = [
        'á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a',
        'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
        'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i',
        'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o',
        'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u',
        'ç' => 'c', 'ñ' => 'n',
    ];

    public static function from(string $text): string
    {
        $text = strtr(mb_strtolower($text), self::ACCENTS);
        $slug = (string) preg_replace('/[^a-z0-9]+/', '-', $text);

        return trim(substr(trim($slug, '-'), 0, 64), '-');
    }

    public static function isValid(string $slug): bool
    {
        return preg_match(self::PATTERN, $slug) === 1;
    }
}

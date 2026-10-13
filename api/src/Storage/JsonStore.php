<?php

declare(strict_types=1);

namespace Urna\Storage;

use RuntimeException;

/**
 * Persistência de um documento JSON por chave (uma eleição por arquivo).
 *
 * Leituras usam lock compartilhado e escritas lock exclusivo em um arquivo
 * `.lock` ao lado do documento, de modo que dois votos simultâneos nunca
 * sobrescrevem um ao outro. A gravação é atômica: escreve em um arquivo
 * temporário e o renomeia sobre o original.
 */
final class JsonStore
{
    public function __construct(private readonly string $dir)
    {
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException("Não foi possível criar o diretório {$dir}.");
        }
    }

    /**
     * @return list<string>
     */
    public function keys(): array
    {
        $keys = array_map(
            static fn (string $file): string => basename($file, '.json'),
            glob($this->dir . '/*.json') ?: [],
        );
        sort($keys);

        return $keys;
    }

    public function exists(string $key): bool
    {
        return is_file($this->path($key));
    }

    /**
     * @return array<string, mixed>|null
     */
    public function read(string $key): ?array
    {
        if (!$this->exists($key)) {
            return null;
        }

        return $this->withLock($key, LOCK_SH, fn () => $this->load($key));
    }

    /**
     * @param array<string, mixed> $data
     */
    public function create(string $key, array $data): void
    {
        $this->withLock($key, LOCK_EX, function () use ($key, $data): void {
            if ($this->exists($key)) {
                throw new RuntimeException("O documento {$key} já existe.");
            }
            $this->write($key, $data);
        });
    }

    /**
     * Lê, transforma e grava o documento sob lock exclusivo.
     *
     * @param callable(array<string, mixed>): array<string, mixed> $mutate
     * @return array<string, mixed> O documento gravado.
     */
    public function update(string $key, callable $mutate): array
    {
        return $this->withLock($key, LOCK_EX, function () use ($key, $mutate): array {
            $data = $this->load($key);
            if ($data === null) {
                throw new RuntimeException("O documento {$key} não existe.");
            }

            $data = $mutate($data);
            $this->write($key, $data);

            return $data;
        });
    }

    public function delete(string $key): void
    {
        $this->withLock($key, LOCK_EX, function () use ($key): void {
            if ($this->exists($key)) {
                unlink($this->path($key));
            }
        });
        @unlink($this->lockPath($key));
    }

    private function path(string $key): string
    {
        return $this->dir . '/' . $key . '.json';
    }

    private function lockPath(string $key): string
    {
        return $this->dir . '/' . $key . '.lock';
    }

    /**
     * @template T
     * @param callable(): T $callback
     * @return T
     */
    private function withLock(string $key, int $mode, callable $callback): mixed
    {
        $handle = fopen($this->lockPath($key), 'c');
        if ($handle === false || !flock($handle, $mode)) {
            throw new RuntimeException("Não foi possível bloquear o documento {$key}.");
        }

        try {
            return $callback();
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private function load(string $key): ?array
    {
        if (!$this->exists($key)) {
            return null;
        }

        $data = json_decode((string) file_get_contents($this->path($key)), true, 512, JSON_THROW_ON_ERROR);

        return is_array($data) ? $data : null;
    }

    /**
     * @param array<string, mixed> $data
     */
    private function write(string $key, array $data): void
    {
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $tmp = $this->path($key) . '.' . bin2hex(random_bytes(4)) . '.tmp';

        if (file_put_contents($tmp, $json . "\n") === false || !rename($tmp, $this->path($key))) {
            @unlink($tmp);
            throw new RuntimeException("Falha ao gravar o documento {$key}.");
        }
    }
}

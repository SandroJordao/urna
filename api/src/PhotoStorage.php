<?php

declare(strict_types=1);

namespace Urna;

use Urna\Http\HttpException;

/**
 * Recebe fotos de candidatos, valida e regrava como WebP 4:5.
 *
 * Regravar a imagem com GD descarta metadados (EXIF/GPS) e qualquer conteúdo
 * que não seja pixel, então o arquivo servido nunca é o que foi enviado.
 */
final class PhotoStorage
{
    private const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

    /**
     * @param array{max_bytes: int, width: int, height: int, quality: int} $options
     */
    public function __construct(
        private readonly string $uploadsDir,
        private readonly array $options,
    ) {
    }

    /**
     * @param array<string, mixed>|null $file Entrada de $_FILES.
     * @return string Caminho relativo à raiz do projeto, ex.: uploads/eleicao/ab12.webp
     */
    public function store(string $slug, ?array $file): string
    {
        $tmp = $this->validate($file);

        $source = @imagecreatefromstring((string) file_get_contents($tmp));
        if ($source === false) {
            throw HttpException::invalid(['photo' => 'Não foi possível ler a imagem.']);
        }

        $image = $this->cover($source, $this->options['width'], $this->options['height']);
        imagedestroy($source);

        $dir = $this->uploadsDir . '/' . $slug;
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }

        $name = bin2hex(random_bytes(8)) . '.webp';
        $saved = imagewebp($image, $dir . '/' . $name, $this->options['quality']);
        imagedestroy($image);

        if (!$saved) {
            throw new \RuntimeException('Falha ao salvar a foto.');
        }

        return 'uploads/' . $slug . '/' . $name;
    }

    public function delete(?string $relative): void
    {
        $path = $this->resolve($relative);
        if ($path !== null && is_file($path)) {
            unlink($path);
        }
    }

    public function deleteAll(string $slug): void
    {
        $dir = $this->uploadsDir . '/' . $slug;
        if (!is_dir($dir)) {
            return;
        }

        foreach (glob($dir . '/*') ?: [] as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
        @rmdir($dir);
    }

    /**
     * Garante que só apagamos arquivos dentro do diretório de uploads.
     */
    private function resolve(?string $relative): ?string
    {
        if ($relative === null || !str_starts_with($relative, 'uploads/') || str_contains($relative, '..')) {
            return null;
        }

        return $this->uploadsDir . '/' . substr($relative, strlen('uploads/'));
    }

    /**
     * @param array<string, mixed>|null $file
     */
    private function validate(?array $file): string
    {
        $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;

        if ($error === UPLOAD_ERR_NO_FILE) {
            throw HttpException::invalid(['photo' => 'Selecione uma imagem.']);
        }
        if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE
            || ($file['size'] ?? 0) > $this->options['max_bytes']) {
            $mb = $this->options['max_bytes'] / 1024 / 1024;
            throw HttpException::invalid(['photo' => "A imagem deve ter no máximo {$mb} MB."]);
        }
        if ($error !== UPLOAD_ERR_OK || !is_uploaded_file((string) $file['tmp_name'])) {
            throw HttpException::invalid(['photo' => 'Falha no envio da imagem.']);
        }

        $tmp = (string) $file['tmp_name'];
        $type = (new \finfo(FILEINFO_MIME_TYPE))->file($tmp);
        $size = @getimagesize($tmp);

        if (!in_array($type, self::ALLOWED_TYPES, true) || $size === false) {
            throw HttpException::invalid(['photo' => 'Envie uma imagem JPG, PNG ou WebP.']);
        }
        if ($size[0] > 8000 || $size[1] > 8000) {
            throw HttpException::invalid(['photo' => 'A imagem é grande demais (máx. 8000px).']);
        }

        return $tmp;
    }

    /**
     * Redimensiona e recorta ao centro, como `object-fit: cover`.
     */
    private function cover(\GdImage $source, int $width, int $height): \GdImage
    {
        $srcW = imagesx($source);
        $srcH = imagesy($source);
        $scale = max($width / $srcW, $height / $srcH);
        $cropW = (int) round($width / $scale);
        $cropH = (int) round($height / $scale);

        $image = imagecreatetruecolor($width, $height);
        imagealphablending($image, false);
        imagesavealpha($image, true);
        imagecopyresampled(
            $image,
            $source,
            0,
            0,
            (int) (($srcW - $cropW) / 2),
            (int) (($srcH - $cropH) / 2),
            $width,
            $height,
            $cropW,
            $cropH,
        );

        return $image;
    }
}

<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

class LocalizationMiddleware
{
    /**
     * Language code mapping for supported languages.
     */
    protected const LANGUAGE_MAP = [
        'english'  => 'en',
        'spanish'  => 'es',
        'french'   => 'fr',
        'german'   => 'de',
        'arabic'   => 'ar',
        'urdu'     => 'ur',
        'hindi'    => 'hi',
        'chinese'  => 'zh',
        'japanese' => 'ja',
        'en'       => 'en',
        'es'       => 'es',
        'fr'       => 'fr',
        'de'       => 'de',
        'ar'       => 'ar',
        'ur'       => 'ur',
        'hi'       => 'hi',
        'zh'       => 'zh',
        'ja'       => 'ja',
    ];

    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user('sanctum') ?? $request->user();

        if ($user && ! empty($user->language)) {
            $langKey = strtolower(trim((string) $user->language));
            $locale = self::LANGUAGE_MAP[$langKey] ?? 'en';
            App::setLocale($locale);
        } elseif ($request->hasHeader('Accept-Language')) {
            $headerLang = strtolower(substr((string) $request->header('Accept-Language'), 0, 2));
            if (in_array($headerLang, array_values(self::LANGUAGE_MAP), true)) {
                App::setLocale($headerLang);
            }
        }

        return $next($request);
    }
}

<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;

class AsStringKeyedJson implements CastsAttributes
{
    public function get($model, $key, $value, $attributes)
    {
        if (is_null($value)) {
            return null;
        }

        $decoded = json_decode($value);

        if (!is_object($decoded) && !is_array($decoded)) {
            return $decoded;
        }

        return $decoded;
    }

    public function set($model, $key, $value, $attributes)
    {
        if (is_null($value)) {
            return null;
        }

        if (is_array($value)) {
            return json_encode((object) $value, JSON_UNESCAPED_UNICODE);
        }

        return json_encode($value, JSON_UNESCAPED_UNICODE);
    }
}

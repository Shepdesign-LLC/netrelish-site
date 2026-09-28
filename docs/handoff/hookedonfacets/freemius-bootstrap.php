<?php
/**
 * Freemius bootstrap for Hooked on Facets (free core).
 *
 * Drop this file next to hooked-on-facets.php and `require_once` it right
 * after the constants block. Replace the two placeholders with the values from
 * Freemius → Developer Dashboard → Hooked on Facets → Settings → Keys.
 *
 * @package HookedOnFacets
 */

declare(strict_types=1);

defined( 'ABSPATH' ) || exit;

if ( function_exists( 'hof_fs' ) ) {
    // The Pro add-on loaded the SDK first; nothing to do.
    hof_fs()->set_basename( false, __FILE__ );
    return;
}

/**
 * Freemius SDK instance for the free core (the parent product).
 */
function hof_fs(): Freemius {
    global $hof_fs;

    if ( ! isset( $hof_fs ) ) {
        require_once HOF_PLUGIN_DIR . 'vendor/freemius/start.php';

        $hof_fs = fs_dynamic_init( [
            'id'              => 'CORE_PRODUCT_ID',   // TODO Freemius product ID (numeric string)
            'slug'            => 'hooked-on-facets',
            'type'            => 'plugin',
            'public_key'      => 'pk_CORE_PUBLIC_KEY', // TODO
            'is_premium'      => false,
            'has_addons'      => true,                 // Hooked on Facets Pro
            'has_paid_plans'  => false,                // paid plans live on the add-on
            'is_org_compliant'=> true,                 // shipped to WordPress.org
            'menu'            => [
                'slug'    => 'hooked-on-facets',       // matches MenuRegistrar's top-level slug
                'contact' => true,
                'support' => false,                    // support routes to hookedonfacets.com
                'account' => true,
                'addons'  => true,
            ],
        ] );
    }

    return $hof_fs;
}

hof_fs();
do_action( 'hof_fs_loaded' );

/**
 * Add-on bootstrap (lives in hooked-on-facets-pro/hooked-on-facets-pro.php).
 * Kept here for reference until that repo is attached.
 *
 * function hof_pro_fs(): Freemius {
 *     global $hof_pro_fs;
 *     if ( ! isset( $hof_pro_fs ) ) {
 *         require_once dirname( __FILE__ ) . '/vendor/freemius/start.php';
 *         $hof_pro_fs = fs_dynamic_init( [
 *             'id'             => 'PRO_ADDON_ID',
 *             'slug'           => 'hooked-on-facets-pro',
 *             'type'           => 'plugin',
 *             'public_key'     => 'pk_PRO_PUBLIC_KEY',
 *             'is_premium'     => true,
 *             'is_premium_only'=> true,
 *             'has_paid_plans' => true,
 *             'is_org_compliant'=> false,
 *             'parent'         => [
 *                 'id'         => 'CORE_PRODUCT_ID',
 *                 'slug'       => 'hooked-on-facets',
 *                 'public_key' => 'pk_CORE_PUBLIC_KEY',
 *                 'name'       => 'Hooked on Facets',
 *             ],
 *             'menu'           => [ 'slug' => 'hooked-on-facets', 'support' => false ],
 *         ] );
 *     }
 *     return $hof_pro_fs;
 * }
 *
 * function hof_pro_fs_is_parent_active_and_loaded(): bool {
 *     return function_exists( 'hof_fs' );
 * }
 *
 * if ( hof_pro_fs_is_parent_active_and_loaded() ) {
 *     hof_pro_fs();                                   // parent already loaded
 * } else {
 *     add_action( 'hof_fs_loaded', 'hof_pro_fs' );    // wait for the core
 * }
 *
 * // Gate the six signature facets:
 * // if ( hof_pro_fs()->can_use_premium_code() ) { ...register Ask, Visual DNA, swipe, wheel, matrix, bin... }
 */

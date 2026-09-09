<?php
/**
 * Plugin Name: WordPress Museum Experiences
 * Plugin URI:  https://github.com/WordPress/museum
 * Description: Serves the WordPress Museum's static experiences at clean URLs.
 * Version:     0.3.0
 * Requires PHP: 7.4
 * License:     GPL-2.0-only
 */

namespace WordPressdotorg\Museum;

const ROUTE_QUERY_VAR = 'wporg_museum_asset';
const ROUTE_VERSION_OPTION = 'wporg_museum_route_version';

add_action( 'init', __NAMESPACE__ . '\register_routes' );
add_action( 'init', __NAMESPACE__ . '\refresh_routes_after_update', 20 );
add_filter( 'query_vars', __NAMESPACE__ . '\register_query_var' );
add_action( 'template_redirect', __NAMESPACE__ . '\serve_asset', 0 );
register_activation_hook( __FILE__, __NAMESPACE__ . '\activate' );
register_deactivation_hook( __FILE__, __NAMESPACE__ . '\deactivate' );

/**
 * Serve a museum HTML document or one of its local assets.
 */
function serve_asset() {
	$route  = get_query_var( ROUTE_QUERY_VAR );
	$assets = assets();

	if ( ! isset( $assets[ $route ] ) ) {
		return;
	}

	$method = isset( $_SERVER['REQUEST_METHOD'] ) ? strtoupper( $_SERVER['REQUEST_METHOD'] ) : 'GET';
	if ( ! in_array( $method, array( 'GET', 'HEAD', 'OPTIONS' ), true ) ) {
		status_header( 405 );
		header( 'Allow: GET, HEAD, OPTIONS' );
		exit;
	}

	if ( 'OPTIONS' === $method ) {
		header( 'Access-Control-Allow-Origin: *' );
		header( 'Access-Control-Allow-Methods: GET, HEAD, OPTIONS' );
		header( 'Access-Control-Allow-Headers: Content-Type' );
		status_header( 204 );
		exit;
	}

	if ( ! empty( $assets[ $route ]['directory'] ) ) {
		$pathname = parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH );
		if ( '/' !== substr( $pathname, -1 ) ) {
			$query = isset( $_SERVER['QUERY_STRING'] ) && '' !== $_SERVER['QUERY_STRING'] ? '?' . $_SERVER['QUERY_STRING'] : '';
			wp_safe_redirect( home_url( '/' . $route . '/' ) . $query, 301 );
			exit;
		}
	}

	$file = __DIR__ . '/' . $assets[ $route ]['file'];
	if ( ! is_readable( $file ) ) {
		status_header( 500 );
		exit;
	}

	global $wp_query;
	$wp_query->is_404 = false;

	status_header( 200 );
	header( 'Content-Type: ' . $assets[ $route ]['type'] );
	header( 'X-Content-Type-Options: nosniff' );
	header( 'Access-Control-Allow-Origin: *' );
	header( $assets[ $route ]['cache'] );

	if ( 'HEAD' !== $method ) {
		readfile( $file );
	}
	exit;
}

/**
 * Register one rewrite rule for each public static route.
 */
function register_routes() {
	foreach ( assets() as $route => $asset ) {
		$optional_slash = ! empty( $asset['directory'] ) ? '/?' : '';
		add_rewrite_rule(
			'^' . preg_quote( $route, '#' ) . $optional_slash . '$',
			'index.php?' . ROUTE_QUERY_VAR . '=' . $route,
			'top'
		);
	}
}

/**
 * Refresh stored rules once when the public route map changes.
 */
function refresh_routes_after_update() {
	$version = route_version();
	if ( $version === get_option( ROUTE_VERSION_OPTION ) ) {
		return;
	}

	flush_rewrite_rules( false );
	update_option( ROUTE_VERSION_OPTION, route_version() );
}

/**
 * Allow WordPress to retain the route selected by the rewrite rule.
 *
 * @param string[] $query_vars Public query variables.
 * @return string[]
 */
function register_query_var( $query_vars ) {
	$query_vars[] = ROUTE_QUERY_VAR;
	return $query_vars;
}

/**
 * Install the clean URL rules.
 */
function activate() {
	register_routes();
	flush_rewrite_rules( false );
	update_option( ROUTE_VERSION_OPTION, route_version() );
}

/**
 * Remove the clean URL rules.
 */
function deactivate() {
	delete_option( ROUTE_VERSION_OPTION );
	flush_rewrite_rules( false );
}

/**
 * Files explicitly published by the shared and per-experience manifests.
 *
 * @return array
 */
function assets() {
	static $assets = null;
	if ( null !== $assets ) {
		return $assets;
	}

	$registry = json_decode( file_get_contents( __DIR__ . '/museums.json' ), true );
	$assets   = array();
	foreach ( $registry['shared'] as $file ) {
		$assets[ $file ] = asset( 'museums/' . $file );
	}
	foreach ( $registry['experiences'] as $slug ) {
		$manifest = json_decode( file_get_contents( __DIR__ . '/museums/' . $slug . '/museum.json' ), true );
		foreach ( $manifest['files'] as $file ) {
			$assets[ $slug . '/' . $file ] = asset( 'museums/' . $slug . '/' . $file );
		}
		$assets[ $slug ] = $assets[ $slug . '/index.html' ];
		$assets[ $slug ]['directory'] = true;
	}
	return $assets;
}

/**
 * Content types for the static files accepted by the repository checks.
 *
 * @param string $file Repository-relative file path.
 * @return array
 */
function asset( $file ) {
	$types = array(
		'html' => 'text/html; charset=UTF-8',
		'css'  => 'text/css; charset=UTF-8',
		'js'   => 'text/javascript; charset=UTF-8',
		'json' => 'application/json; charset=UTF-8',
		'jpg'  => 'image/jpeg',
		'png'  => 'image/png',
		'svg'  => 'image/svg+xml',
		'webp' => 'image/webp',
		'glb'  => 'model/gltf-binary',
		'ttf'  => 'font/ttf',
		'md'   => 'text/plain; charset=UTF-8',
		'txt'  => 'text/plain; charset=UTF-8',
	);
	return array(
		'file'  => $file,
		'type'  => $types[ pathinfo( $file, PATHINFO_EXTENSION ) ],
		'cache' => asset_cache_control( $file ),
	);
}

/**
 * Cache static assets while keeping pages and unversioned application code fresh.
 *
 * @param string $file Repository-relative file path.
 * @return string
 */
function asset_cache_control( $file ) {
	$extension = pathinfo( $file, PATHINFO_EXTENSION );
	if ( 'ttf' === $extension ) {
		return 'Cache-Control: public, max-age=31536000, immutable';
	}
	if ( 'museums/data/releases.js' === $file || in_array( $extension, array( 'json', 'jpg', 'png', 'svg', 'webp', 'glb' ), true ) ) {
		return 'Cache-Control: public, max-age=3600';
	}
	return 'Cache-Control: no-cache';
}

/**
 * Refresh rewrites when a manifest adds or removes a route.
 *
 * @return string
 */
function route_version() {
	return md5( json_encode( array_keys( assets() ) ) );
}

<?php
/**
 * Plugin Name: WordPress Museum Experiences
 * Plugin URI:  https://github.com/WordPress/museum
 * Description: Serves the WordPress Museum's static experiences at clean URLs.
 * Version:     0.2.0
 * Requires PHP: 7.4
 * License:     GPL-2.0-only
 */

namespace WordPressdotorg\Museum;

const ROUTE_QUERY_VAR = 'wporg_museum_asset';
const ROUTE_VERSION = '2';
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
	if ( ! in_array( $method, array( 'GET', 'HEAD' ), true ) ) {
		status_header( 405 );
		header( 'Allow: GET, HEAD' );
		exit;
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
		$optional_slash = 'text/html; charset=UTF-8' === $asset['type'] ? '/?' : '';
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
	if ( ROUTE_VERSION === get_option( ROUTE_VERSION_OPTION ) ) {
		return;
	}

	flush_rewrite_rules( false );
	update_option( ROUTE_VERSION_OPTION, ROUTE_VERSION );
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
	update_option( ROUTE_VERSION_OPTION, ROUTE_VERSION );
}

/**
 * Remove the clean URL rules.
 */
function deactivate() {
	delete_option( ROUTE_VERSION_OPTION );
	flush_rewrite_rules( false );
}

/**
 * Files exposed through the museum site's URL space.
 *
 * The map is deliberately explicit. Adding a file to the repository does not
 * make it public until its route is reviewed and added here.
 *
 * @return array<string, array{file: string, type: string, cache: string}>
 */
function assets() {
	return array(
		'desktop' => array(
			'file'  => 'museums/desktop/index.html',
			'type'  => 'text/html; charset=UTF-8',
			'cache' => 'Cache-Control: no-cache',
		),
		'winamp' => array(
			'file'  => 'museums/winamp/index.html',
			'type'  => 'text/html; charset=UTF-8',
			'cache' => 'Cache-Control: no-cache',
		),
		'data/releases.js' => array(
			'file'  => 'museums/data/releases.js',
			'type'  => 'text/javascript; charset=UTF-8',
			'cache' => 'Cache-Control: public, max-age=3600',
		),
		'assets/fonts/press-start-2p/PressStart2P-Regular.ttf' => array(
			'file'  => 'museums/assets/fonts/press-start-2p/PressStart2P-Regular.ttf',
			'type'  => 'font/ttf',
			'cache' => 'Cache-Control: public, max-age=31536000, immutable',
		),
		'assets/fonts/vt323/VT323-Regular.ttf' => array(
			'file'  => 'museums/assets/fonts/vt323/VT323-Regular.ttf',
			'type'  => 'font/ttf',
			'cache' => 'Cache-Control: public, max-age=31536000, immutable',
		),
	);
}

<?php
// Minimal WordPress boundary for route and HTTP tests; never published.
function add_action() {}
function add_filter() {}
function register_activation_hook() {}
function register_deactivation_hook() {}
function get_query_var( $name ) { return $GLOBALS['route']; }
function status_header( $status ) { http_response_code( $status ); }
function home_url( $path ) { return '/museum' . $path; }
function wp_safe_redirect( $url, $status ) { header( 'Location: ' . $url, true, $status ); }
function add_rewrite_rule( $pattern, $query, $position ) { $GLOBALS['rules'][ $pattern ] = $query; }
function get_option( $name ) { return $GLOBALS['options'][ $name ] ?? false; }
function update_option( $name, $value ) { $GLOBALS['options'][ $name ] = $value; }
function delete_option( $name ) { unset( $GLOBALS['options'][ $name ] ); }
function flush_rewrite_rules( $hard ) { $GLOBALS['flushes'] = ( $GLOBALS['flushes'] ?? 0 ) + 1; }

require __DIR__ . '/../museum.php';

if ( PHP_SAPI === 'cli' ) {
	if ( 'routes' === ( $argv[1] ?? '' ) ) {
		echo json_encode( WordPressdotorg\Museum\assets() );
	} else {
		WordPressdotorg\Museum\register_routes();
		WordPressdotorg\Museum\refresh_routes_after_update();
		WordPressdotorg\Museum\refresh_routes_after_update();
		if ( 1 !== $GLOBALS['flushes'] ) {
			throw new Exception( 'Route updates must flush once.' );
		}
		foreach ( WordPressdotorg\Museum\assets() as $route => $asset ) {
			$matches = array_filter( array_keys( $GLOBALS['rules'] ), function ( $pattern ) use ( $route ) {
				return preg_match( '#' . $pattern . '#', $route );
			} );
			if ( 1 !== count( $matches ) ) {
				throw new Exception( 'Each route must match exactly one rewrite: ' . $route );
			}
		}
		echo 'WordPress rewrite checks passed.';
	}
	return;
}

$pathname = parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH );
$GLOBALS['route'] = null;
WordPressdotorg\Museum\register_routes();
if ( 0 === strpos( $pathname, '/museum/' ) ) {
	$relative = substr( $pathname, strlen( '/museum/' ) );
	foreach ( $GLOBALS['rules'] as $pattern => $query ) {
		if ( preg_match( '#' . $pattern . '#', $relative ) ) {
			parse_str( substr( $query, strlen( 'index.php?' ) ), $vars );
			$GLOBALS['route'] = $vars[ WordPressdotorg\Museum\ROUTE_QUERY_VAR ];
			break;
		}
	}
}
$GLOBALS['wp_query'] = (object) array( 'is_404' => true );
WordPressdotorg\Museum\serve_asset();
http_response_code( 404 );
echo 'WordPress fallback';

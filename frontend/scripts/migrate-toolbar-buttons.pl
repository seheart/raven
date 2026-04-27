#!/usr/bin/perl
# Migrate hand-rolled toolbar buttons to <ToolbarButton>.
# Three variants matched: default, primary, danger.
# Idempotent: safe to re-run.

use strict;
use warnings;

# Common attribute regex pieces
my $onclick = qr{onclick=\{([^{}]+)\}};
my $disabled = qr{disabled=\{([^{}]+)\}};
my $title = qr{title="([^"]+)"};

for my $file (@ARGV) {
  open my $fh, '<', $file or die "open $file: $!";
  local $/;
  my $content = <$fh>;
  close $fh;
  my $orig = $content;

  # ── Default toolbar button (with disabled) ───────────────────────────
  $content =~ s{
    <button\s+
      $onclick\s+
      $disabled\s+
      class="\Qpx-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors disabled:opacity-50\E"\s*
    >\s*
      ([^<]+?)\s*
    </button>
  }{<ToolbarButton onClick={$1} disabled={$2}>$3</ToolbarButton>}gxs;

  # ── Default toolbar (no disabled) ────────────────────────────────────
  $content =~ s{
    <button\s+
      $onclick\s+
      class="\Qpx-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors\E"\s*
    >\s*
      ([^<]+?)\s*
    </button>
  }{<ToolbarButton onClick={$1}>$2</ToolbarButton>}gxs;

  # ── Default with class-then-onclick order ────────────────────────────
  $content =~ s{
    <button\s+
      class="\Qpx-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors\E"\s+
      $onclick\s*
    >\s*
      ([^<]+?)\s*
    </button>
  }{<ToolbarButton onClick={$1}>$2</ToolbarButton>}gxs;

  # ── Primary button (filled accent) ───────────────────────────────────
  $content =~ s{
    <button\s+
      $onclick\s+
      class="px-3 py-1\.5 bg-accent text-white rounded text-sm[^"]*"\s*
    >\s*
      ([^<]+?)\s*
    </button>
  }{<ToolbarButton variant="primary" onClick={$1}>$2</ToolbarButton>}gxs;

  # ── Primary with disabled ────────────────────────────────────────────
  $content =~ s{
    <button\s+
      $onclick\s+
      $disabled\s+
      class="px-3 py-1\.5 bg-accent[^"]*"\s*
    >\s*
      ([^<]+?)\s*
    </button>
  }{<ToolbarButton variant="primary" onClick={$1} disabled={$2}>$3</ToolbarButton>}gxs;

  # ── Danger (border-error) ────────────────────────────────────────────
  $content =~ s{
    <button\s+
      $onclick\s+
      class="\Qpx-3 py-1.5 bg-surface border border-error rounded text-sm font-sans text-error hover:bg-error-subtle transition-colors\E"\s*
    >\s*
      ([^<]+?)\s*
    </button>
  }{<ToolbarButton variant="danger" onClick={$1}>$2</ToolbarButton>}gxs;

  if ($content ne $orig) {
    open my $out, '>', $file or die "write $file: $!";
    print $out $content;
    close $out;
    print "migrated: $file\n";
  }
}

#!/usr/bin/perl
# Replace duplicated refresh-button markup with <RefreshButton ... />
# Idempotent: safe to re-run.

use strict;
use warnings;

for my $file (@ARGV) {
  open my $fh, '<', $file or die "open $file: $!";
  local $/;
  my $content = <$fh>;
  close $fh;
  my $orig = $content;

  # Match the canonical refresh-button pattern.
  # \Q...\E disables regex meta in literal class string.
  # The {1,3} loosens whitespace handling without committing to .*.
  my $re = qr{
    <button\s+
      onclick=\{([^{}]+)\}\s+
      disabled=\{([^{}]+)\}\s+
      class="\Qpx-3 py-1.5 bg-surface border border-border rounded text-sm font-sans hover:border-accent transition-colors disabled:opacity-50\E"\s*
    >\s*
      \{\s*\2\s*\?\s*'\.\.\.'\s*:\s*'(?:\\u21BB|↻)'\s*\}\s*Refresh\s*
    </button>
  }xs;

  $content =~ s{$re}{<RefreshButton onClick={$1} loading={$2} />}g;

  if ($content ne $orig) {
    open my $out, '>', $file or die "write $file: $!";
    print $out $content;
    close $out;
    print "migrated: $file\n";
  }
}

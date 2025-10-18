use similar::{ChangeTag, TextDiff};
use std::fmt::Write as FmtWrite;

/// Generate unified diff between two text contents
pub fn generate_diff(old_content: &str, new_content: &str, context_lines: usize) -> String {
    let diff = TextDiff::from_lines(old_content, new_content);

    let mut output = String::new();

    for (idx, group) in diff.grouped_ops(context_lines).iter().enumerate() {
        if idx > 0 {
            writeln!(&mut output, "{:-^1$}", "-", 80).unwrap();
        }

        for op in group {
            for change in diff.iter_changes(op) {
                let (sign, style) = match change.tag() {
                    ChangeTag::Delete => ("-", "red"),
                    ChangeTag::Insert => ("+", "green"),
                    ChangeTag::Equal => (" ", ""),
                };

                write!(&mut output, "{}{}", sign, change).unwrap();
            }
        }
    }

    output
}

/// Calculate similarity ratio between two strings
pub fn similarity_ratio(old: &str, new: &str) -> f64 {
    let diff = TextDiff::from_lines(old, new);
    diff.ratio() as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diff_generation() {
        let old = "line 1\nline 2\nline 3";
        let new = "line 1\nmodified line 2\nline 3";

        let diff = generate_diff(old, new, 3);
        assert!(diff.contains("-line 2"));
        assert!(diff.contains("+modified line 2"));
    }

    #[test]
    fn test_similarity() {
        let old = "hello world";
        let new = "hello world";
        assert_eq!(similarity_ratio(old, new), 1.0);

        let old = "hello";
        let new = "goodbye";
        assert!(similarity_ratio(old, new) < 0.5);
    }
}

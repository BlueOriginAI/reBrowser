diff --git a/extensions/browser/extension_event_histogram_value.h b/extensions/browser/extension_event_histogram_value.h
--- a/extensions/browser/extension_event_histogram_value.h
+++ b/extensions/browser/extension_event_histogram_value.h
@@ -598,6 +598,7 @@ enum HistogramValue {
   DICTATION_PRIVATE_ON_START_STREAM = 575,
   DICTATION_PRIVATE_ON_END_STREAM = 576,
   DICTATION_PRIVATE_ON_CONTEXT_UPDATE = 577,
+  BROWSER_OS_ON_UI_LANGUAGE_CHANGED = 578,
   // Last entry: Add new entries above, then run:
   // tools/metrics/histograms/update_extension_histograms.py
   ENUM_BOUNDARY

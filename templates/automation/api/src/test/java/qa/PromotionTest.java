package qa;

import io.karatelabs.core.Runner;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertFalse;

public class PromotionTest {
    @Test
    void promotions() {
        var builder = Runner.builder()
            .path(System.getenv().getOrDefault("QA_FEATURE", "classpath:features"))
            .outputDir(System.getenv().getOrDefault("QA_REPORT_DIR", "build/karate-reports"))
            .outputCucumberJson(true)
            .outputJunitXml(true);
        String tag = System.getenv("QA_TAG");
        if (tag != null && !tag.isBlank()) builder.tags(tag);
        var result = builder.parallel(2);
        assertFalse(result.isFailed(), "Karate scenario failure; inspect native reports");
    }
}

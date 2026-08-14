import { cn } from "@mastra/playground-ui/utils/cn";
import { FrownIcon, AlertTriangleIcon } from "lucide-react";
import { Container } from "./shared";

interface TemplateFailureProps {
  errorMsg?: string;
  validationErrors?: { message?: string; type?: string }[];
}

export function TemplateFailure({ errorMsg, validationErrors }: TemplateFailureProps) {
  const errorString = errorMsg;
  const isSchemaError = errorString?.includes("Invalid schema for function");
  const isValidationError =
    errorString?.includes("validation issue") || (validationErrors && validationErrors.length > 0);

  const getUserFriendlyMessage = () => {
    if (isValidationError) {
      return "模板安装已完成，但仍有一些验证问题。模板可能仍可正常使用，建议检查并修复这些问题。";
    }
    if (isSchemaError) {
      return "AI 模型配置存在问题，可能与所选模型或 AI SDK 版本兼容性有关。";
    }
    return "安装模板时发生意外错误。";
  };

  const getIconAndTitle = () => {
    if (isValidationError) {
      return {
        icon: <AlertTriangleIcon className="text-yellow-500" />,
        title: "模板已安装，但存在警告",
      };
    }
    return {
      icon: <FrownIcon />,
      title: "模板安装失败",
    };
  };

  const { icon, title } = getIconAndTitle();

  return (
    <Container className="space-y-4 text-neutral3 mb-8 content-center">
      {/* Main Error Display */}
      <div
        className={cn(
          "grid items-center justify-items-center gap-4 content-center",
          "[&>svg]:w-8 [&>svg]:h-8",
        )}
      >
        {icon}
        <div className="text-center space-y-2">
          <p className="text-ui-md font-medium text-neutral5">{title}</p>
          <p className="text-ui-md text-neutral3">{getUserFriendlyMessage()}</p>
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors && validationErrors.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-neutral3 hover:text-neutral4 select-none text-center">
            显示验证问题（{validationErrors.length}）
          </summary>
          <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto max-h-60 text-left space-y-2">
            {validationErrors.map((error, index) => (
              <div key={index} className="border-l-2 border-red-400 pl-2">
                <div className="font-medium text-red-600 dark:text-red-400">
                  {error.type === "typescript" ? "🔴 TypeScript 错误" : "⚠️ Lint 错误"}
                </div>
                <div className="text-xs font-mono text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap wrap-break-word">
                  {error.message}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* General Error Details */}
      {errorString && !isValidationError && (
        <details className="text-xs">
          <summary className="cursor-pointer text-neutral3 hover:text-neutral4 select-none text-center">
            显示详情
          </summary>
          <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono overflow-auto max-h-60 text-left">
            <div className="whitespace-pre-wrap wrap-break-word">{errorString}</div>
          </div>
        </details>
      )}
    </Container>
  );
}

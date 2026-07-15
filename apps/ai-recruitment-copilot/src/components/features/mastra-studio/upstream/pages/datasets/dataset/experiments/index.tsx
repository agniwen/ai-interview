import { Button } from "@mastra/playground-ui/components/Button";
import {
  MainContentContent,
  MainContentLayout,
} from "@mastra/playground-ui/components/MainContent";
import { MainHeader } from "@mastra/playground-ui/components/MainHeader";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { GitCompare, ArrowLeft } from "lucide-react";
import {
  useParams,
  useSearchParams,
  Link,
} from "@/components/features/mastra-studio/router/compat";
import { DatasetExperimentsComparison } from "@/components/features/mastra-studio/upstream/domains/datasets";
import { useDataset } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-datasets";

function CompareDatasetExperimentsPage() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { error } = useDataset(datasetId ?? "");
  const experimentIdA = searchParams.get("baseline") ?? "";
  const experimentIdB = searchParams.get("contender") ?? "";

  if (error && is401UnauthorizedError(error)) {
    return (
      <MainContentLayout>
        <div className="flex h-full items-center justify-center">
          <SessionExpired />
        </div>
      </MainContentLayout>
    );
  }

  if (error && is403ForbiddenError(error)) {
    return (
      <MainContentLayout>
        <div className="flex h-full items-center justify-center">
          <PermissionDenied resource="数据集" />
        </div>
      </MainContentLayout>
    );
  }

  if (!datasetId || !experimentIdA || !experimentIdB) {
    return (
      <MainContentLayout>
        <MainContentContent>
          <div className="text-neutral4 text-center py-8">
            <p>请选择两个实验进行对比。</p>
            <p className="text-sm mt-2">
              请使用 URL 格式：/datasets/{"{datasetId}"}/experiments?baseline={"{experimentIdA}"}
              &contender=
              {"{experimentIdB}"}
            </p>
          </div>
        </MainContentContent>
      </MainContentLayout>
    );
  }

  return (
    <MainContentLayout>
      <MainContentContent>
        <div className="max-w-[100rem] w-full px-12 mx-auto grid content-start ">
          <MainHeader>
            <MainHeader.Column>
              <MainHeader.Title>
                <GitCompare /> 数据集实验对比
              </MainHeader.Title>
              <MainHeader.Description>
                正在对比{" "}
                <Link to={`/datasets/${datasetId}/experiments/${experimentIdA}`}>
                  {experimentIdA.slice(0, 8)}
                </Link>{" "}
                对比{" "}
                <Link to={`/datasets/${datasetId}/experiments/${experimentIdB}`}>
                  {experimentIdB.slice(0, 8)}
                </Link>
              </MainHeader.Description>
            </MainHeader.Column>
            <MainHeader.Column>
              <Button as={Link} to={`/datasets/${datasetId}`}>
                <ArrowLeft />
                返回数据集
              </Button>
            </MainHeader.Column>
          </MainHeader>

          <DatasetExperimentsComparison
            datasetId={datasetId}
            experimentIdA={experimentIdA}
            experimentIdB={experimentIdB}
            onSwap={() => {
              setSearchParams({ baseline: experimentIdB, contender: experimentIdA });
            }}
          />
        </div>
      </MainContentContent>
    </MainContentLayout>
  );
}

export { CompareDatasetExperimentsPage };
export default CompareDatasetExperimentsPage;
